import type { Product, ProductSearchResult } from '@/types/product';
import type { CatalogCardData } from '@/components/products/product-catalog-card';

/**
 * Flatten a `Product` (from `GET /products`) into the normalized card data.
 *
 * The list endpoint returns `category` and `vendor` as nested objects;
 * we project them down to the flat strings the card needs.
 *
 * Phase 1 (2026-08-28): now uses the 3-price model. The card shows
 * `effectivePrice` (discountPrice if set, else salePrice) prominently,
 * and shows the original salePrice with strikethrough when a discount
 * is active.
 */
export function productToCardData(p: Product): CatalogCardData {
  return {
    id: p.id,
    name: p.name,
    price: p.effectivePrice,
    unit: p.unit,
    imageUrl: p.imageUrl,
    originalPrice: p.discountPrice ? p.salePrice : null,
    discountActive: !!p.discountPrice,
    genericName: p.genericName,
    categoryName: p.category?.name ?? '—',
    vendorName: p.vendor?.name ?? '—',
    isEssential: p.isEssential,
  };
}

/**
 * Flatten a `ProductSearchResult` (from `GET /products/search`) into the
 * normalized card data. Search results already have flat fields.
 */
export function searchResultToCardData(p: ProductSearchResult): CatalogCardData {
  return {
    id: p.id,
    name: p.name,
    price: p.effectivePrice,
    unit: p.unit,
    imageUrl: p.imageUrl,
    originalPrice: p.discountPrice ? p.salePrice : null,
    discountActive: !!p.discountPrice,
    genericName: p.genericName,
    categoryName: p.categoryName,
    vendorName: p.vendorName,
  };
}
