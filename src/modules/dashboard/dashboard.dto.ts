import { z } from 'zod';

// ─── Summary query (GET /dashboard/summary) ──────────────────
// Returns aggregate metrics for a given month:
//   - doneCount: number of delivered orders in that month
//   - avgTotalMinutes: average time from order creation to delivery (in minutes)
//   - avgStepMinutes: average time spent in each status transition
//
// Scoped by role:
//   - super_admin → sees all orders in the month
//   - regular user → sees only their own orders

export const dashboardSummaryQuerySchema = z.object({
  // ISO year-month: '2026-08'. Defaults to current month if not provided.
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format (e.g. 2026-08)')
    .optional(),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;

export interface DashboardSummary {
  month: string;
  doneCount: number;
  avgTotalMinutes: number | null;
  avgStepMinutes: {
    pending_to_waiting_vendor: number | null;
    waiting_vendor_to_preparing: number | null;
    preparing_to_picked_up: number | null;
    picked_up_to_delivered: number | null;
  };
}

// ─── Chart data endpoints ─────────────────────────────────────
// Three endpoints that return arrays ready to feed into a chart library
// (Recharts, Chart.js, etc.) without any client-side processing.

// GET /dashboard/orders-per-day?days=30
export const ordersPerDayQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type OrdersPerDayQuery = z.infer<typeof ordersPerDayQuerySchema>;

export interface DailyCountPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

// GET /dashboard/avg-time-per-day?days=30
export const avgTimePerDayQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type AvgTimePerDayQuery = z.infer<typeof avgTimePerDayQuerySchema>;

export interface DailyAvgTimePoint {
  date: string; // YYYY-MM-DD
  avgMinutes: number | null; // null if no deliveries that day
}

// GET /dashboard/category-breakdown?month=2026-08
export const categoryBreakdownQuerySchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format (e.g. 2026-08)')
    .optional(),
});
export type CategoryBreakdownQuery = z.infer<typeof categoryBreakdownQuerySchema>;

export interface CategoryBreakdownPoint {
  categorySlug: string;
  categoryName: string;
  orderCount: number;
}

// ─── Price analytics (Phase 5, 2026-08-28) ────────────────────

// GET /dashboard/vendor-stability?days=30
// Returns per-vendor: how many price changes in the last N days + avg magnitude.
export const vendorStabilityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type VendorStabilityQuery = z.infer<typeof vendorStabilityQuerySchema>;

// GET /dashboard/vendor-profitability?month=2026-08
// Returns per-vendor: total margin from delivered orders in the month.
export const vendorProfitabilityQuerySchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format (e.g. 2026-08)')
    .optional(),
});
export type VendorProfitabilityQuery = z.infer<typeof vendorProfitabilityQuerySchema>;
