import type { Request, Response } from 'express';
import { createCategorySchema, updateCategorySchema } from './categories.dto';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './categories.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /categories ──────────────────────────────────────────
export async function list(_req: Request, res: Response): Promise<void> {
  const categories = await listCategories();
  sendSuccess(res, { data: categories }, 'Categories retrieved');
}

// ─── POST /categories ──────────────────────────────────────────
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const category = await createCategory(parsed.data);
  sendSuccess(res, { category }, 'Category created', 201);
}

// ─── PATCH /categories/:id ─────────────────────────────────────
export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid category id');
  }

  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const category = await updateCategory(id, parsed.data);
  sendSuccess(res, { category }, 'Category updated');
}

// ─── DELETE /categories/:id ────────────────────────────────────
export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid category id');
  }

  const result = await deleteCategory(id);
  sendSuccess(res, { category: result }, 'Category deleted');
}
