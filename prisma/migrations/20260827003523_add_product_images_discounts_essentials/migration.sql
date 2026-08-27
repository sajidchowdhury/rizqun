-- DropIndex
DROP INDEX "products_search_vector_idx";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "discount_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "generic_name" TEXT,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "is_essential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "original_price" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "products_is_essential_idx" ON "products"("is_essential");
