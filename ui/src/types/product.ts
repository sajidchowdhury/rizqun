/** Product types — mirrors backend product shape
 * (see rizqun/src/modules/products/products.dto.ts). */

import type { VendorCategory } from './vendor';

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  /** Decimal as string (JSON-safe — backend uses Prisma.Decimal). */
  price: string;
  categoryId: number;
  vendorId: number;
  unit: string;
  isActive: boolean;
  brand: string | null;
  imageUrl: string | null;
  originalPrice: string | null;
  discountActive: boolean;
  genericName: string | null;
  isEssential: boolean;
  createdAt: string;
  updatedAt: string;
  /** Included when the request asks for `include: { category, vendor }`. */
  category?: { id: number; slug: string; name: string };
  vendor?: { id: number; name: string; phone: string; whatsappNumber: string | null };
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
  price: number;
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
  price: string;
  unit: string;
  vendorId: number;
  vendorName: string;
  vendorWhatsappNumber: string | null;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  imageUrl: string | null;
  originalPrice: string | null;
  discountActive: boolean;
  genericName: string | null;
  rank: number;
  source: 'fts' | 'ilike';
}

export interface ProductSearchResponse {
  data: ProductSearchResult[];
}

// Re-export for convenience
export type { VendorCategory };
