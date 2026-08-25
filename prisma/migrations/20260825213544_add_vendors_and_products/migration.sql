-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('grocery', 'medicine', 'other');

-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp_number" TEXT,
    "category" "VendorCategory" NOT NULL DEFAULT 'other',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "search_vector" tsvector,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_category_idx" ON "vendors"("category");

CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

CREATE INDEX "products_category_id_idx" ON "products"("category_id");

CREATE INDEX "products_vendor_id_idx" ON "products"("vendor_id");

CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Session 2.1 additions: GIN index + auto-maintained search_vector ──

-- 1. GIN index for fast full-text search on the tsvector column
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

-- 2. Trigger function: keeps search_vector in sync with the name column
CREATE OR REPLACE FUNCTION "products_search_vector_update"() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.name, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger: fires BEFORE INSERT OR UPDATE on products
CREATE TRIGGER "products_search_vector_trigger"
  BEFORE INSERT OR UPDATE ON "products"
  FOR EACH ROW
  EXECUTE FUNCTION "products_search_vector_update"();

-- 4. Backfill existing rows (if any) so they have a search_vector
UPDATE "products" SET "search_vector" = to_tsvector('english', coalesce("name", '')) WHERE "search_vector" IS NULL;
