import type { Product, ProductSearchResult } from '@/types/product';
import type { CatalogCardData } from '@/components/products/product-catalog-card';

/**
 * Flatten a `Product` (from `GET /products`) into the normalized card data.
 *
 * The list endpoint returns `category` and `vendor` as nested objects;
 * we project them down to the flat strings the card needs.
 */
export function productToCardData(p: Product): CatalogCardData {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    unit: p.unit,
    imageUrl: p.imageUrl,
    originalPrice: p.originalPrice,
    discountActive: p.discountActive,
    genericName: p.genericName,
    categoryName: p.category?.name ?? '—',
    vendorName: p.vendor?.name ?? '—',
    isEssential: p.isEssential,
  };
}

/**
 * Flatten a `ProductSearchResult` (from `GET /products/search`) into the
 * normalized card data. Search results already have flat fields, so this
 * is mostly a 1:1 projection.
 */
export function searchResultToCardData(p: ProductSearchResult): CatalogCardData {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    unit: p.unit,
    imageUrl: p.imageUrl,
    originalPrice: p.originalPrice,
    discountActive: p.discountActive,
    genericName: p.genericName,
    categoryName: p.categoryName,
    vendorName: p.vendorName,
  };
}
