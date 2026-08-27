import type { Request, Response } from 'express';
import {
  dashboardSummaryQuerySchema,
  ordersPerDayQuerySchema,
  avgTimePerDayQuerySchema,
  categoryBreakdownQuerySchema,
  vendorStabilityQuerySchema,
  vendorProfitabilityQuerySchema,
} from './dashboard.dto';
import {
  getDashboardSummary,
  getOrdersPerDay,
  getAvgTimePerDay,
  getCategoryBreakdown,
} from './dashboard.service';
import { getVendorStability, getVendorProfitability } from '../products/price-analytics.service';
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

// ─── GET /dashboard/vendor-stability ──────────────────────────
//
// Phase 5 (2026-08-28): per-vendor price-change count + avg magnitude
// for the last N days. Used by the /prices/history page's "vendor
// stability ranking" table. Available to all authenticated users
// (price changes are shop-wide, not per-user).

export async function getVendorStabilityHandler(req: Request, res: Response): Promise<void> {
  const parsed = vendorStabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const result = await getVendorStability(parsed.data);
  sendSuccess(res, result, 'Vendor stability');
}

// ─── GET /dashboard/vendor-profitability ──────────────────────
//
// Phase 5 (2026-08-28): per-vendor total margin from delivered orders
// in the target month. Used by the /prices/history page's "profit per
// vendor" table. Role-scoped (operators see only their own orders).

export async function getVendorProfitabilityHandler(req: Request, res: Response): Promise<void> {
  const parsed = vendorProfitabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await getVendorProfitability(parsed.data, { userId, role });
  sendSuccess(res, result, 'Vendor profitability');
}
