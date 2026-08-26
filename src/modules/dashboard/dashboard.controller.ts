import type { Request, Response } from 'express';
import { dashboardSummaryQuerySchema } from './dashboard.dto';
import { getDashboardSummary } from './dashboard.service';
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
