import type { Request, Response } from 'express';
import {
  dashboardSummaryQuerySchema,
  ordersPerDayQuerySchema,
  avgTimePerDayQuerySchema,
  categoryBreakdownQuerySchema,
} from './dashboard.dto';
import {
  getDashboardSummary,
  getOrdersPerDay,
  getAvgTimePerDay,
  getCategoryBreakdown,
} from './dashboard.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /dashboard/summary ──────────────────────────────────
// Returns: doneCount, avgTotalMinutes, avgStepMinutes for the given month.
// Scoped by role (operators see own, super_admin sees all).
export async function getSummary(req: Request, res: Response): Promise<void> {
  const parsed = dashboardSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const summary = await getDashboardSummary(parsed.data, { userId, role });
  sendSuccess(res, summary, 'Dashboard summary');
}

// ─── GET /dashboard/orders-per-day ────────────────────────────
export async function getOrdersPerDayHandler(req: Request, res: Response): Promise<void> {
  const parsed = ordersPerDayQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await getOrdersPerDay(parsed.data.days, { userId, role });
  sendSuccess(res, result, 'Orders per day');
}

// ─── GET /dashboard/avg-time-per-day ──────────────────────────
export async function getAvgTimePerDayHandler(req: Request, res: Response): Promise<void> {
  const parsed = avgTimePerDayQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await getAvgTimePerDay(parsed.data.days, { userId, role });
  sendSuccess(res, result, 'Avg time per day');
}

// ─── GET /dashboard/category-breakdown ────────────────────────
export async function getCategoryBreakdownHandler(req: Request, res: Response): Promise<void> {
  const parsed = categoryBreakdownQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await getCategoryBreakdown(parsed.data, { userId, role });
  sendSuccess(res, result, 'Category breakdown');
}
