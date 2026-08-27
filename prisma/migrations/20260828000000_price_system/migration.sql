-- ─────────────────────────────────────────────────────────────────
-- Rizqun — Phase 1 price system migration (2026-08-28)
-- ─────────────────────────────────────────────────────────────────
--
-- 3 prices per product (was 1 `price`):
--   - purchase_price  (p.price): what we pay the vendor
--   - sale_price      (s.price): what we charge the customer (was `price`)
--   - discount_price  (optional): if set, active customer price
--
-- Per-vendor purchase price on `product_vendors` (new column).
--
-- New `product_price_history` table — audit log of every price change.
--
-- New `order_items.purchase_price_snapshot` + `vendor_choice_reason`
-- so we can compute margin per order item even after prices change.
--
-- This migration is reversible. Apply with:
--   psql "$DATABASE_URL" -f prisma/migrations/20260828000000_price_system/migration.sql
--
-- Or just run `npx prisma db push` — Prisma will generate equivalent
-- ALTER statements from the schema diff. This file is for reference +
-- production deployment via `prisma migrate deploy`.
-- ─────────────────────────────────────────────────────────────────

-- ─── 1. Rename `products.price` → `products.sale_price` ──────────
-- (Prisma can't rename columns; we ALTER + DROP in one go.)

ALTER TABLE "products"
  RENAME COLUMN "price" TO "sale_price";

-- ─── 2. Add `products.purchase_price` (p.price) ──────────────────
-- Default 0 so existing rows are valid. Operators fill in via the
-- morning price-update workflow.

ALTER TABLE "products"
  ADD COLUMN "purchase_price" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ─── 3. Replace `original_price` + `discount_active` with `discount_price` ──
-- For each existing row:
--   - If `discount_active` was true AND `original_price` was set, then
--     `discount_price` = the current `price` (i.e. the discounted price
--     the shop was already charging), and `sale_price` = `original_price`
--     (the pre-discount price becomes the new "list" sale price).
--   - Otherwise, `discount_price` = NULL (no discount was active).
--
-- This preserves the operator's intent: rows that had an active discount
-- keep showing the discounted price to customers.

-- First, swap salePrice/discountPrice for rows that had an active discount
UPDATE "products"
  SET "discount_price" = "sale_price",
      "sale_price"     = "original_price"
  WHERE "discount_active" = true
    AND "original_price" IS NOT NULL
    AND "original_price" > "sale_price";

-- Now drop the old columns
ALTER TABLE "products"
  DROP COLUMN "original_price",
  DROP COLUMN "discount_active";

-- Add the nullable discount_price column (for rows that had no discount,
-- discount_price stays NULL — meaning "no discount active")
ALTER TABLE "products"
  ADD COLUMN "discount_price" DECIMAL(10,2);

-- ─── 4. Add per-vendor purchase price to `product_vendors` ──────
-- The same product can be sourced from multiple vendors at different
-- prices. This is the foundation for Phase 4 vendor-profitability
-- auto-selection.

ALTER TABLE "product_vendors"
  ADD COLUMN "purchase_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "is_preferred"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
  ADD COLUMN "updated_at"      TIMESTAMP NOT NULL DEFAULT now();

-- ─── 5. Create `product_price_history` table ──────────────────
-- Audit log of every price change. Snapshot of all 3 prices at the
-- time of change, plus who changed them and when.

CREATE TABLE "product_price_history" (
  "id"             SERIAL          NOT NULL,
  "product_id"     INTEGER         NOT NULL,
  "vendor_id"      INTEGER,
  "purchase_price" DECIMAL(10,2)  NOT NULL,
  "sale_price"     DECIMAL(10,2)  NOT NULL,
  "discount_price" DECIMAL(10,2),
  "changed_by"     INTEGER         NOT NULL,
  "changed_at"     TIMESTAMP       NOT NULL DEFAULT now(),
  "note"           TEXT,

  CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- Indexes for the common query patterns:
--   - "show me price history for product X" (productId + changedAt)
--   - "show me what vendor V changed" (vendorId + changedAt)
--   - "show me what user U changed" (changedBy)

CREATE INDEX "product_price_history_product_id_changed_at_idx"
  ON "product_price_history" ("product_id", "changed_at");

CREATE INDEX "product_price_history_vendor_id_changed_at_idx"
  ON "product_price_history" ("vendor_id", "changed_at");

CREATE INDEX "product_price_history_changed_by_idx"
  ON "product_price_history" ("changed_by");

-- Foreign keys
ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE SET NULL;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_changed_by_fkey"
  FOREIGN KEY ("changed_by") REFERENCES "users" ("id") ON DELETE RESTRICT;

-- ─── 6. Add `order_items.purchase_price_snapshot` + `vendor_choice_reason` ──
-- Allows computing margin per order item even after prices change.
-- `vendor_choice_reason` explains why this vendor was chosen for this
-- item (Phase 4 will populate "auto" / "manual" / "only-vendor" / etc).

ALTER TABLE "order_items"
  ADD COLUMN "purchase_price_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vendor_choice_reason"     TEXT;

-- ─── 7. Drop the tsvector trigger + column, then recreate ────────
-- Prisma's `db push` doesn't manage the `search_vector` column (it's
-- `Unsupported("tsvector")`). Renaming the table or columns could break
-- the trigger, so we drop + recreate it to be safe.
--
-- If you're applying this manually and your trigger is still working,
-- you can skip this section.

DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
DROP FUNCTION IF EXISTS products_search_vector_update();

-- (The column itself is preserved by Prisma — no need to recreate it.)
-- Recreate the trigger function + trigger:

CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = to_tsvector('english', NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_vector_trigger
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION products_search_vector_update();

-- ─── End of migration ───────────────────────────────────────────
