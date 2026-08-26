import type { Request, Response } from 'express';
import { finalizeOrderSchema, listOrdersQuerySchema } from './orders.dto';
import { finalizeOrder, listOrders, getOrderById } from './orders.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── POST /orders (finalize cart) ─────────────────────────────
// Converts the active cart (frontend state) into a saved Order.
// Auth required — `req.user` is set by the `authenticate` middleware.
export async function finalize(req: Request, res: Response): Promise<void> {
  const parsed = finalizeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Not authenticated');
  }
  const userCategoryAccess = req.user?.categoryAccess ?? [];

  const order = await finalizeOrder(parsed.data, {
    userId,
    userCategoryAccess,
  });

  sendSuccess(res, { order }, 'Order created', 201);
}

// ─── GET /orders ──────────────────────────────────────────────
// Paginated list scoped by user role — operators see only their own,
// super_admin sees all.
export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await listOrders(parsed.data, { userId, role });
  sendSuccess(res, result, 'Orders retrieved');
}

// ─── GET /orders/:id ─────────────────────────────────────────
// Full order detail with items + nested vendor info.
// Non-super_admin users get 404 if they try to access another user's order
// (not 403 — to avoid leaking that the order exists).
export async function getOne(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid order id');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const order = await getOrderById(id, { userId, role });
  sendSuccess(res, { order }, 'Order retrieved');
}
