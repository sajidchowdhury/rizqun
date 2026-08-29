import type { Request, Response } from 'express';
import {
  listProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  searchProductsQuerySchema,
  quickAddProductSchema,
  bulkUpdatePricesSchema,
  setVendorPriceSchema,
  priceHistoryQuerySchema,
  listVendorProductsQuerySchema,
} from './products.dto';
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  quickAddProduct,
  getProductRecommendations,
  getEssentialProducts,
  bulkUpdatePrices,
  setVendorPrice,
  getPriceHistory,
  listVendorProducts,
} from './products.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /products ─────────────────────────────────────────────
export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  // Pass the user's category filter (set by the `categoryScope` middleware)
  // so non-admin users see only products in their allowed categories.
  const result = await listProducts(parsed.data, req.categoryFilter);
  sendSuccess(res, result, 'Products retrieved');
}

// ─── GET /products/:id ─────────────────────────────────────────
export async function getOne(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid product id');
  }

  const product = await getProductById(id);
  sendSuccess(res, { product }, 'Product retrieved');
}

// ─── POST /products ────────────────────────────────────────────
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const product = await createProduct(parsed.data);
  sendSuccess(res, { product }, 'Product created', 201);
}

// ─── PATCH /products/:id ───────────────────────────────────────
export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid product id');
  }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  // Pass the user context so the service can log price changes to
  // ProductPriceHistory (only when a price field actually changes).
  const userId = req.user?.userId;
  const ctx = userId ? { userId } : undefined;

  const product = await updateProduct(id, parsed.data, ctx);
  sendSuccess(res, { product }, 'Product updated');
}

// ─── DELETE /products/:id (soft delete) ────────────────────────
export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid product id');
  }

  const result = await deleteProduct(id);
  sendSuccess(res, { product: result }, 'Product deactivated');
}

// ─── GET /products/search ──────────────────────────────────────
// Smart search endpoint — full-text search with ILIKE fallback.
// Category scoping is applied via the `categoryScope` middleware in routes.
export async function search(req: Request, res: Response): Promise<void> {
  const parsed = searchProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  // `req.categoryFilter` is set by the `categoryScope` middleware
  const categoryFilter = req.categoryFilter;

  const result = await searchProducts(parsed.data, categoryFilter);
  sendSuccess(res, result, 'Search completed');
}

// ─── POST /products/quick-add ──────────────────────────────────
// Operator-side, in-call product creation. Available to any authenticated
// user — but the service enforces that the requested `categorySlug` is in
// the user's `categoryAccess`.
export async function quickAdd(req: Request, res: Response): Promise<void> {
  const parsed = quickAddProductSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  // `req.user` is set by the `authenticate` middleware
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Not authenticated');
  }
  const userCategoryAccess = req.user?.categoryAccess ?? [];

  const product = await quickAddProduct(parsed.data, userId, userCategoryAccess);
  sendSuccess(res, { product }, 'Product created via quick-add', 201);
}

// ─── GET /products/:id/recommendations ─────────────────────────
// Returns products frequently bought together with the given product.
export async function recommendations(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid product id');
  }

  const limit = Math.min(Number(req.query.limit) || 5, 20);
  const products = await getProductRecommendations(id, limit);
  sendSuccess(res, { data: products }, 'Recommendations retrieved');
}

// ─── GET /products/essentials ──────────────────────────────────
// Returns products flagged as isEssential — curated household necessities
// for push-sale suggestions.
export async function essentials(_req: Request, res: Response): Promise<void> {
  const limit = Math.min(10, 20);
  const products = await getEssentialProducts(limit);
  sendSuccess(res, { data: products }, 'Essential products retrieved');
}

// ─── POST /products/bulk-update-prices ────────────────────────
//
// The morning vendor-call workflow. Operator calls vendor, gets the
// day's prices, submits them all at once. The service updates Product
// + ProductVendor + ProductPriceHistory in one transaction.
//
// Auth: any authenticated user (operators do this daily).

export async function bulkUpdatePricesHandler(req: Request, res: Response): Promise<void> {
  const parsed = bulkUpdatePricesSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await bulkUpdatePrices(parsed.data, { userId });
  sendSuccess(res, result, `Updated ${result.updated} products, ${result.historyRows} history rows written`);
}

// ─── POST /products/:id/vendor-price ─────────────────────────
//
// Set per-vendor purchase price for one product. Used by Phase 4 prep
// (when the operator wants to manually record a vendor's price without
// going through the full bulk-update workflow).

export async function setVendorPriceHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid product id');
  }

  const parsed = setVendorPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await setVendorPrice(id, parsed.data, { userId });
  sendSuccess(res, result, 'Vendor price updated');
}

// ─── GET /products/:id/price-history ──────────────────────────
//
// Returns the audit log of every price change for a product.

export async function priceHistory(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid product id');
  }

  const parsed = priceHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const result = await getPriceHistory(id, parsed.data);
  sendSuccess(res, result, 'Price history retrieved');
}

// ─── GET /vendors/:id/products ────────────────────────────────
//
// Used by the morning price-update page. Returns the vendor's full
// catalog (default-vendor products + ProductVendor-sourced products)
// with the vendor's per-vendor purchasePrice included.

export async function vendorProducts(req: Request, res: Response): Promise<void> {
  const vendorId = Number(req.params.id);
  if (Number.isNaN(vendorId) || vendorId <= 0) {
    throw new AppError(400, 'Invalid vendor id');
  }

  const parsed = listVendorProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  // Pass the user's category filter (set by `categoryScope` middleware on
  // the vendors router) so an operator with grocery-only access can't see
  // medicine products even when picking a vendor that supplies both.
  const result = await listVendorProducts(vendorId, parsed.data, req.categoryFilter);
  sendSuccess(res, result, 'Vendor products retrieved');
}
