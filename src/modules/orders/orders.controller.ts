import type { Request, Response } from 'express';
import {
  finalizeOrderSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  listPendingOrdersQuerySchema,
  cancelOrderSchema,
} from './orders.dto';
import {
  finalizeOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  listPendingOrders,
  cancelOrder,
} from './orders.service';
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

// ─── PATCH /orders/:id/status ────────────────────────────────
// Updates the order status with full audit trail (status_log append-only).
// Validates transition is allowed per ALLOWED_TRANSITIONS matrix.
export async function updateStatus(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid order id');
  }

  const parsed = updateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const order = await updateOrderStatus(id, parsed.data, { userId, role });
  sendSuccess(res, { order }, 'Order status updated');
}

// ─── GET /orders/pending ──────────────────────────────────────
// Specialized list for the operator's most-used view. Returns only "in-flight"
// orders (pending, waiting_vendor, preparing), sorted oldest-first so stale
// orders bubble to the top.
export async function listPending(req: Request, res: Response): Promise<void> {
  const parsed = listPendingOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await listPendingOrders(parsed.data, { userId, role });
  sendSuccess(res, result, 'Pending orders retrieved');
}

// ─── DELETE /orders/:id (cancel / soft-delete) ───────────────
// Sets status to 'cancelled' and inserts a status_log row.
// Only allowed from pending, waiting_vendor, or preparing.
// Order is never physically removed — preserves audit trail.
export async function cancel(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid order id');
  }

  const parsed = cancelOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await cancelOrder(id, parsed.data, { userId, role });
  sendSuccess(res, { order: result }, 'Order cancelled');
}
