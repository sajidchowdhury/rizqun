import { z } from 'zod';

// ─── 3-price model (Phase 1, 2026-08-28) ─────────────────────
//
// Rizqun now tracks 3 prices per product:
//   - purchasePrice  (p.price): what the shop pays the vendor
//   - salePrice      (s.price): what the shop charges the customer (always required)
//   - discountPrice (optional): if set, this is the active customer price
//                               (overrides salePrice in the order UI)
//
// Per-vendor purchase prices live in `ProductVendor.purchasePrice` — see
// `setVendorPriceSchema` below for the endpoint that sets them.

const priceSchema = z
  .number()
  .min(0, 'Price must be >= 0')
  .max(99999999.99, 'Price must be <= 99,999,999.99');

// ─── Create ─────────────────────────────────────────────────────

export const createProductSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(500, 'Name must be at most 500 characters'),
  sku: z.string().trim().min(1, 'SKU cannot be empty if provided').max(100).optional(),
  // salePrice is required — what we charge the customer
  salePrice: priceSchema,
  // purchasePrice defaults to 0 — operators fill it in via the morning
  // price-update workflow (or it stays 0 if the shop doesn't track cost).
  purchasePrice: priceSchema.optional().default(0),
  // discountPrice is optional — if set, that's the active customer price
  discountPrice: priceSchema.nullable().optional(),
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
    salePrice: priceSchema.optional(),
    purchasePrice: priceSchema.optional(),
    discountPrice: priceSchema.nullable().optional(),
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
//
// `effectivePrice` is the price the customer actually pays — discountPrice
// if set, otherwise salePrice. This is the value the order UI should
// display prominently (the cart also uses this for line totals).
//
// `price` is kept as an alias for `salePrice` for backward compatibility
// with any client that still reads `.price` — but new code should prefer
// `salePrice` / `effectivePrice`.

export interface SearchResultRow {
  id: number;
  name: string;
  // 3 prices (Phase 1, 2026-08-28)
  salePrice: string; // Decimal as string (JSON-safe)
  purchasePrice: string; // Decimal as string
  discountPrice: string | null; // Decimal as string, or null if no discount
  // Convenience: the price the customer actually pays (discountPrice if set,
  // otherwise salePrice). Frontend uses this for cart math + display.
  effectivePrice: string;
  unit: string;
  // Vendor fields are nullable because the FTS/ILIKE search now uses
  // LEFT JOIN vendors (so products with no vendor still appear).
  vendorId: number | null;
  vendorName: string | null;
  vendorWhatsappNumber: string | null;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  imageUrl: string | null;
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
  salePrice: priceSchema,
  purchasePrice: priceSchema.optional().default(0),
  discountPrice: priceSchema.nullable().optional(),
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

// ─── Bulk price update (the morning vendor-call workflow) ──────
//
// POST /products/bulk-update-prices
//
// The operator calls a vendor in the morning, gets the day's prices,
// and submits them all at once. Each update can set:
//   - purchasePrice  : the new p.price for this product (from this vendor)
//   - salePrice      : the new s.price (what we charge customers)
//   - discountPrice  : set/null to clear or set a new discount
//
// The service writes the new prices to Product AND appends a
// ProductPriceHistory row per changed product (in a single transaction).
//
// `vendorId` is the vendor the operator is calling — used to:
//   - Filter which products are eligible (the vendor's products, by
//     ProductVendor OR Product.vendorId)
//   - Write the per-vendor purchasePrice to ProductVendor (and upsert the
//     ProductVendor row if it doesn't exist)
//   - Set vendorId on the ProductPriceHistory rows

export const bulkUpdatePriceItemSchema = z.strictObject({
  productId: z.number().int().positive(),
  // All three are optional — only the ones the operator wants to change
  // are submitted. The service diffs against the current Product values
  // and only writes/ logs what actually changed.
  purchasePrice: priceSchema.optional(),
  salePrice: priceSchema.optional(),
  // `nullable` so the client can explicitly clear a discount by sending
  // `null`. `optional` so the client can omit it (leave discount as-is).
  discountPrice: priceSchema.nullable().optional(),
});

export const bulkUpdatePricesSchema = z.strictObject({
  vendorId: z.number().int().positive(),
  // Optional note logged on every history row (e.g. "Morning call 2026-08-28")
  note: z.string().trim().max(500).optional(),
  updates: z.array(bulkUpdatePriceItemSchema).min(1, 'At least one update is required').max(500),
});

export type BulkUpdatePricesInput = z.infer<typeof bulkUpdatePricesSchema>;

// ─── Set per-vendor purchase price (used by Phase 4 prep) ──────
//
// POST /products/:id/vendor-price
//
// Sets `ProductVendor.purchasePrice` for a single (product, vendor) pair.
// Upserts the ProductVendor row if it doesn't exist yet. Also writes a
// ProductPriceHistory row with `vendorId` set (so we can track per-vendor
// price changes over time).

export const setVendorPriceSchema = z.strictObject({
  vendorId: z.number().int().positive(),
  purchasePrice: priceSchema,
  // Manual override flag for Phase 4 auto-selection
  isPreferred: z.boolean().optional(),
});

export type SetVendorPriceInput = z.infer<typeof setVendorPriceSchema>;

// ─── Price history query ───────────────────────────────────────
//
// GET /products/:id/price-history
//
// Returns the audit log of every price change for a product. Filterable
// by vendorId (to see only this vendor's purchase-price changes) and
// date range (for "what was the price on date X" queries).

export const priceHistoryQuerySchema = z.object({
  // Filter by vendor — null/omitted = all changes (product-level + vendor-specific)
  vendorId: z.coerce.number().int().positive().optional(),
  // ISO date filter
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type PriceHistoryQuery = z.infer<typeof priceHistoryQuerySchema>;

// ─── List vendor products query (GET /vendors/:id/products) ────
//
// Used by the price-update page. Optional filters:
//   - categoryId : filter by product category
//   - search     : search by product name (ILIKE)
//   - includeInactive : include inactive products (default false)
//   - limit      : max results (default 500, hard cap 1000)

export const listVendorProductsQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? false : v === 'true')),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export type ListVendorProductsQueryInput = z.infer<typeof listVendorProductsQuerySchema>;
