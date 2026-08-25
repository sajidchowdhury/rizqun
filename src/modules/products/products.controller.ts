import type { Request, Response } from 'express';
import {
  listProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  searchProductsQuerySchema,
} from './products.dto';
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} from './products.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /products ─────────────────────────────────────────────
export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const result = await listProducts(parsed.data);
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

  const product = await updateProduct(id, parsed.data);
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
