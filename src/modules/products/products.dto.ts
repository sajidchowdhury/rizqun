import { z } from 'zod';

// ─── Create ─────────────────────────────────────────────────────

export const createProductSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  sku: z.string().trim().min(1, 'SKU cannot be empty if provided').max(100).optional(),
  price: z.number().min(0, 'Price must be >= 0').max(99999999.99, 'Price must be <= 99,999,999.99'),
  categoryId: z.number().int().positive('categoryId must be a positive integer'),
  vendorId: z.number().int().positive('vendorId must be a positive integer'),
  unit: z.string().trim().min(1).max(50).default('pcs'),
  isActive: z.boolean().optional().default(true),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ─── Update ─────────────────────────────────────────────────────

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(500).optional(),
    sku: z.string().trim().min(1).max(100).nullable().optional(),
    price: z.number().min(0).max(99999999.99).optional(),
    categoryId: z.number().int().positive().optional(),
    vendorId: z.number().int().positive().optional(),
    unit: z.string().trim().min(1).max(50).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ─── List query ─────────────────────────────────────────────────

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.coerce.number().int().positive().optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // category slug, e.g. 'grocery' — used by category-scope middleware to filter
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// ─── Search query ───────────────────────────────────────────────
// Used by GET /products/search — the smart search endpoint.
//
// Category filtering is enforced in two ways:
//   1. If `req.categoryFilter.hasAll` is false (user without 'all' access),
//      the service restricts results to the user's allowed category slugs.
//   2. If the user passes an explicit `category=` query, it's intersected with
//      the user's allowed list (so a user with ['grocery'] cannot bypass and
//      request 'medicine').

export const searchProductsQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query must not be empty').max(200, 'Query too long'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // Optional category filter — intersected with user's categoryAccess
  category: z.string().trim().optional(),
});

export type SearchProductsQuery = z.infer<typeof searchProductsQuerySchema>;

// ─── Search result row shape ────────────────────────────────────
export interface SearchResultRow {
  id: number;
  name: string;
  price: string; // Decimal as string (JSON-safe)
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
  rank: number; // FTS rank (0 for ILIKE fallback rows)
  source: 'fts' | 'ilike'; // which search strategy matched
}

// ─── Quick-add (operator-side, in-call product creation) ──────
// Used by POST /products/quick-add — any authenticated user with the
// appropriate categoryAccess can create a product on the fly during a call.
//
// Unlike the super-admin /products endpoint, this one accepts a `categorySlug`
// instead of `categoryId` (operators don't know internal IDs) and auto-generates
// a SKU if one is not provided.

export const quickAddProductSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  price: z.number().min(0, 'Price must be >= 0').max(99999999.99, 'Price must be <= 99,999,999.99'),
  vendorId: z.number().int().positive('vendorId must be a positive integer'),
  categorySlug: z
    .string()
    .trim()
    .min(1, 'categorySlug is required')
    .max(50, 'categorySlug too long'),
  unit: z.string().trim().min(1).max(50).default('pcs'),
  // Optional — auto-generated if not provided (format: QUICK-{userId}-{timestamp})
  sku: z.string().trim().min(1).max(100).optional(),
});

export type QuickAddProductInput = z.infer<typeof quickAddProductSchema>;
