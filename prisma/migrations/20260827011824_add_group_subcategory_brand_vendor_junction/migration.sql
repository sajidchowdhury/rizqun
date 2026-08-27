-- 1. Create the groups table FIRST (before adding group_id to categories)
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "groups_slug_key" ON "groups"("slug");

-- 2. Insert default groups
INSERT INTO "groups" ("slug", "name", "updated_at") VALUES
  ('grocery', 'Grocery', NOW()),
  ('medicine', 'Medicine', NOW()),
  ('other', 'Other', NOW());

-- 3. Add group_id to categories with a default (pointing to 'other' group = id 3)
ALTER TABLE "categories" ADD COLUMN "group_id" INTEGER NOT NULL DEFAULT 3;

-- 4. Assign existing categories to their proper groups
UPDATE "categories" SET "group_id" = (SELECT id FROM "groups" WHERE slug = 'grocery') WHERE slug = 'grocery';
UPDATE "categories" SET "group_id" = (SELECT id FROM "groups" WHERE slug = 'medicine') WHERE slug = 'medicine';
UPDATE "categories" SET "group_id" = (SELECT id FROM "groups" WHERE slug = 'other') WHERE slug = 'other';

-- 5. Drop the old vendor FK so we can make vendor_id nullable
ALTER TABLE "products" DROP CONSTRAINT "products_vendor_id_fkey";

-- 6. Add brand + sub_category_id, make vendor_id nullable
ALTER TABLE "products" ADD COLUMN "brand" TEXT;
ALTER TABLE "products" ADD COLUMN "sub_category_id" INTEGER;
ALTER TABLE "products" ALTER COLUMN "vendor_id" DROP NOT NULL;

-- 7. Drop the old CategorySlug enum (no longer used)
DROP TYPE IF EXISTS "CategorySlug";

-- 8. Create sub_categories table
CREATE TABLE "sub_categories" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sub_categories_slug_key" ON "sub_categories"("slug");
CREATE INDEX "sub_categories_category_id_idx" ON "sub_categories"("category_id");

-- 9. Create product_vendors junction table
CREATE TABLE "product_vendors" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,

    CONSTRAINT "product_vendors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "product_vendors_vendor_id_idx" ON "product_vendors"("vendor_id");
CREATE UNIQUE INDEX "product_vendors_product_id_vendor_id_key" ON "product_vendors"("product_id", "vendor_id");

-- 10. Add indexes
CREATE INDEX "categories_group_id_idx" ON "categories"("group_id");
CREATE INDEX "products_sub_category_id_idx" ON "products"("sub_category_id");

-- 11. Add foreign keys
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_vendors" ADD CONSTRAINT "product_vendors_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_vendors" ADD CONSTRAINT "product_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
