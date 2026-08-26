import type { Request, Response } from 'express';
import { finalizeOrderSchema } from './orders.dto';
import { finalizeOrder } from './orders.service';
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
