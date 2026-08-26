import { prisma } from '../../config/prisma';
import type { DashboardSummary, DashboardSummaryQuery } from './dashboard.dto';

// ─── Dashboard summary ────────────────────────────────────────
//
// Returns:
//   - doneCount: COUNT of orders with status='delivered' AND deliveredAt in [monthStart, monthEnd)
//   - avgTotalMinutes: AVG(EXTRACT(EPOCH FROM (deliveredAt - createdAt)) / 60) for those orders
//   - avgStepMinutes: per-transition average time, computed from status_log
//
// Step-time computation uses a window function (LAG) over status_log partitioned by order_id.
// For each order that was delivered in the target month, we look at its status_log entries
// and compute the time delta between consecutive transitions.
//
// Scoped by role:
//   - super_admin → all orders
//   - regular user → only their own orders (filter on orders.user_id)

interface DashboardContext {
  userId: number;
  role: string;
}

// Helper: parse 'YYYY-MM' → [monthStart, monthEnd) as Date objects
function parseMonthRange(monthStr: string): { start: Date; end: Date } {
  const [yearStr, monStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monStr, 10);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export async function getDashboardSummary(
  query: DashboardSummaryQuery,
  ctx: DashboardContext,
): Promise<DashboardSummary> {
  // Default to current month if not provided
  const now = new Date();
  const month =
    query.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const { start: monthStart, end: monthEnd } = parseMonthRange(month);

  // We branch on role because Prisma's $queryRaw doesn't support conditional
  // SQL fragments easily. Two near-identical queries is clearer than trying
  // to inject a raw WHERE clause.

  const isSuperAdmin = ctx.role === 'super_admin';

  // ─── 1. doneCount + avgTotalMinutes ────────────────────────
  const summaryRows = isSuperAdmin
    ? await prisma.$queryRaw<Array<{ done_count: bigint; avg_total_minutes: number | null }>>`
        SELECT
          COUNT(*)::bigint AS done_count,
          AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60)::float AS avg_total_minutes
        FROM orders o
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${monthStart}
          AND o.delivered_at < ${monthEnd}
      `
    : await prisma.$queryRaw<Array<{ done_count: bigint; avg_total_minutes: number | null }>>`
        SELECT
          COUNT(*)::bigint AS done_count,
          AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60)::float AS avg_total_minutes
        FROM orders o
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${monthStart}
          AND o.delivered_at < ${monthEnd}
          AND o.user_id = ${ctx.userId}
      `;

  const doneCount = Number(summaryRows[0]?.done_count ?? 0n);
  const rawAvgTotal = summaryRows[0]?.avg_total_minutes ?? null;
  const avgTotalMinutes = rawAvgTotal !== null ? Math.round(rawAvgTotal * 10) / 10 : null;

  // ─── 2. avgStepMinutes via window function on status_log ──
  //
  // For each order delivered in the target month, look at its status_log entries
  // and compute the time delta between consecutive transitions using LAG().
  //
  // Result: one row per (from_status, to_status) pair with the average minutes.
  // We skip the very first entry per order (prev_changed_at IS NULL) since it has
  // no prior transition to diff against.
  //
  // Also skip entries where from_status == to_status (item add/remove audit entries
  // have from=to, e.g. 'pending → pending' for added_item) — those aren't status
  // transitions and would produce misleading 0-minute averages.

  const stepRows = isSuperAdmin
    ? await prisma.$queryRaw<
        Array<{
          from_status: string | null;
          to_status: string;
          avg_minutes: number | null;
        }>
      >`
        WITH transitions AS (
          SELECT
            sl.order_id,
            sl.from_status,
            sl.to_status,
            sl.changed_at,
            LAG(sl.changed_at) OVER (PARTITION BY sl.order_id ORDER BY sl.changed_at, sl.id) AS prev_changed_at
          FROM status_log sl
          JOIN orders o ON o.id = sl.order_id
          WHERE o.status = 'delivered'
            AND o.delivered_at >= ${monthStart}
            AND o.delivered_at < ${monthEnd}
        )
        SELECT
          from_status,
          to_status,
          AVG(EXTRACT(EPOCH FROM (changed_at - prev_changed_at)) / 60)::float AS avg_minutes
        FROM transitions
        WHERE prev_changed_at IS NOT NULL
          AND from_status IS NOT NULL
          AND from_status <> to_status
        GROUP BY from_status, to_status
      `
    : await prisma.$queryRaw<
        Array<{
          from_status: string | null;
          to_status: string;
          avg_minutes: number | null;
        }>
      >`
        WITH transitions AS (
          SELECT
            sl.order_id,
            sl.from_status,
            sl.to_status,
            sl.changed_at,
            LAG(sl.changed_at) OVER (PARTITION BY sl.order_id ORDER BY sl.changed_at, sl.id) AS prev_changed_at
          FROM status_log sl
          JOIN orders o ON o.id = sl.order_id
          WHERE o.status = 'delivered'
            AND o.delivered_at >= ${monthStart}
            AND o.delivered_at < ${monthEnd}
            AND o.user_id = ${ctx.userId}
        )
        SELECT
          from_status,
          to_status,
          AVG(EXTRACT(EPOCH FROM (changed_at - prev_changed_at)) / 60)::float AS avg_minutes
        FROM transitions
        WHERE prev_changed_at IS NOT NULL
          AND from_status IS NOT NULL
          AND from_status <> to_status
        GROUP BY from_status, to_status
      `;

  // Build a lookup map: "from->to" → avg_minutes
  const stepMap = new Map<string, number | null>();
  for (const row of stepRows) {
    const key = `${row.from_status}->${row.to_status}`;
    stepMap.set(key, row.avg_minutes);
  }

  return {
    month,
    doneCount,
    avgTotalMinutes,
    avgStepMinutes: {
      pending_to_waiting_vendor: stepMap.get('pending->waiting_vendor') ?? null,
      waiting_vendor_to_preparing: stepMap.get('waiting_vendor->preparing') ?? null,
      preparing_to_picked_up: stepMap.get('preparing->picked_up') ?? null,
      picked_up_to_delivered: stepMap.get('picked_up->delivered') ?? null,
    },
  };
}
