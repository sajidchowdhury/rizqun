/** Product types — mirrors backend product shape
 * (see rizqun/src/modules/products/products.dto.ts). */

import type { VendorCategory } from './vendor';

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  // ─── 3 prices (Phase 1, 2026-08-28) ─────────────────────────
  // All Decimals as string (JSON-safe — backend uses Prisma.Decimal).
  purchasePrice: string;
  salePrice: string;
  discountPrice: string | null;
  // Convenience: what the customer actually pays (discountPrice if set,
  // else salePrice). Computed by the backend so the frontend doesn't
  // need to re-derive it per row.
  effectivePrice: string;
  categoryId: number;
  vendorId: number | null;
  unit: string;
  isActive: boolean;
  brand: string | null;
  imageUrl: string | null;
  genericName: string | null;
  isEssential: boolean;
  createdAt: string;
  updatedAt: string;
  /** Included when the request asks for `include: { category, vendor }`. */
  category?: { id: number; slug: string; name: string };
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null };
  /** Per-vendor purchase prices, if loaded. Undefined on list views where
   *  we don't fetch the join (to keep the payload small). */
  productVendors?: Array<{
    vendorId: number;
    vendorName: string;
    purchasePrice: string;
    isPreferred: boolean;
  }>;
}

// ─── List query ───────────────────────────────────────────────────

export interface ProductListQuery {
  page?: number;
  limit?: number;
  categoryId?: number;
  vendorId?: number;
  isActive?: boolean;
  category?: string; // slug
  search?: string;
}

export interface ProductsResponse {
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductResponse {
  product: Product;
}

// ─── Form shapes ───────────────────────────────────────────────────

export interface ProductCreateForm {
  name: string;
  sku: string;
  salePrice: number;
  purchasePrice?: number;
  discountPrice?: number | null;
  categoryId: number;
  vendorId: number;
  unit: string;
  isActive: boolean;
}

export type ProductUpdateForm = Partial<ProductCreateForm>;

// ─── Search ────────────────────────────────────────────────────────

export interface ProductSearchResult {
  id: number;
  name: string;
  // 3 prices (Phase 1, 2026-08-28)
  salePrice: string;
  purchasePrice: string;
  discountPrice: string | null;
  effectivePrice: string;
  unit: string;
  vendorId: number;
  vendorName: string;
  vendorWhatsappNumber: string | null;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  imageUrl: string | null;
  genericName: string | null;
  rank: number;
  source: 'fts' | 'ilike';
}

export interface ProductSearchResponse {
  data: ProductSearchResult[];
}

// ─── Vendor products (GET /vendors/:id/products) ───────────────────
//
// Used by the morning price-update page. Mirrors the backend
// `VendorProductRow` interface.

export interface VendorProduct {
  id: number;
  name: string;
  brand: string | null;
  unit: string;
  imageUrl: string | null;
  categoryId: number;
  categoryName: string;
  // The vendor's current purchase price for this product (from
  // ProductVendor — '0' if no row exists yet).
  vendorPurchasePrice: string;
  // True if this vendor is the product's default vendor
  // (Product.vendorId = vendorId).
  isDefaultVendor: boolean;
  // Product-level prices (current values, displayed for reference).
  purchasePrice: string;
  salePrice: string;
  discountPrice: string | null;
  effectivePrice: string;
  isActive: boolean;
}

export interface VendorProductsResponse {
  data: VendorProduct[];
  vendor: { id: number; name: string };
}

// ─── Bulk price update (POST /products/bulk-update-prices) ────────

export interface BulkUpdatePriceItem {
  productId: number;
  purchasePrice?: number;
  salePrice?: number;
  // `null` explicitly clears the discount; `undefined` leaves it as-is.
  discountPrice?: number | null;
}

export interface BulkUpdatePricesPayload {
  vendorId: number;
  note?: string;
  updates: BulkUpdatePriceItem[];
}

export interface BulkUpdatePricesResult {
  updated: number;
  historyRows: number;
}

// ─── Price history (GET /products/:id/price-history) ──────────────

export interface PriceHistoryEntry {
  id: number;
  productId: number;
  vendorId: number | null;
  vendorName: string | null;
  purchasePrice: string;
  salePrice: string;
  discountPrice: string | null;
  effectivePrice: string;
  changedBy: number;
  changedByName: string;
  changedAt: string;
  note: string | null;
}

export interface PriceHistoryResponse {
  data: PriceHistoryEntry[];
}

// Re-export for convenience
export type { VendorCategory };
