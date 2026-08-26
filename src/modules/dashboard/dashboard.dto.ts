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
  avgTotalMinutes: number | null; // null if no delivered orders in month
  avgStepMinutes: {
    pending_to_waiting_vendor: number | null;
    waiting_vendor_to_preparing: number | null;
    preparing_to_picked_up: number | null;
    picked_up_to_delivered: number | null;
  };
}
