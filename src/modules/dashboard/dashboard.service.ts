import { prisma } from '../../config/prisma';
import type {
  DashboardSummary,
  DashboardSummaryQuery,
  DailyCountPoint,
  DailyAvgTimePoint,
  CategoryBreakdownPoint,
  CategoryBreakdownQuery,
} from './dashboard.dto';

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

// ─── Orders per day (GET /dashboard/orders-per-day) ────────────
//
// Returns a daily count of delivered orders for the last N days.
// Zero-filled: days with no deliveries still appear with count=0 so the
// chart doesn't have gaps.
//
// We generate the date series in the application layer (not SQL generate_series)
// to keep the query simple and portable.

export async function getOrdersPerDay(
  days: number,
  ctx: DashboardContext,
): Promise<{ data: DailyCountPoint[] }> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  startDate.setUTCHours(0, 0, 0, 0);

  const isSuperAdmin = ctx.role === 'super_admin';

  const rows = isSuperAdmin
    ? await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT
          DATE(o.delivered_at) AS date,
          COUNT(*)::bigint AS count
        FROM orders o
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${startDate}
        GROUP BY DATE(o.delivered_at)
        ORDER BY date ASC
      `
    : await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT
          DATE(o.delivered_at) AS date,
          COUNT(*)::bigint AS count
        FROM orders o
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${startDate}
          AND o.user_id = ${ctx.userId}
        GROUP BY DATE(o.delivered_at)
        ORDER BY date ASC
      `;

  // Build a map for O(1) lookup
  const countMap = new Map<string, number>();
  for (const row of rows) {
    const dateStr = row.date.toISOString().slice(0, 10);
    countMap.set(dateStr, Number(row.count));
  }

  // Zero-fill: generate all days in the range
  const data: DailyCountPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    data.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
  }

  return { data };
}

// ─── Avg time per day (GET /dashboard/avg-time-per-day) ──────
//
// Returns the average total order time (creation → delivery) per day
// for the last N days. Null for days with no deliveries.

export async function getAvgTimePerDay(
  days: number,
  ctx: DashboardContext,
): Promise<{ data: DailyAvgTimePoint[] }> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  startDate.setUTCHours(0, 0, 0, 0);

  const isSuperAdmin = ctx.role === 'super_admin';

  const rows = isSuperAdmin
    ? await prisma.$queryRaw<Array<{ date: Date; avg_minutes: number | null }>>`
        SELECT
          DATE(o.delivered_at) AS date,
          AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60)::float AS avg_minutes
        FROM orders o
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${startDate}
        GROUP BY DATE(o.delivered_at)
        ORDER BY date ASC
      `
    : await prisma.$queryRaw<Array<{ date: Date; avg_minutes: number | null }>>`
        SELECT
          DATE(o.delivered_at) AS date,
          AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60)::float AS avg_minutes
        FROM orders o
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${startDate}
          AND o.user_id = ${ctx.userId}
        GROUP BY DATE(o.delivered_at)
        ORDER BY date ASC
      `;

  const avgMap = new Map<string, number | null>();
  for (const row of rows) {
    const dateStr = row.date.toISOString().slice(0, 10);
    avgMap.set(dateStr, row.avg_minutes);
  }

  // Zero-fill
  const data: DailyAvgTimePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const avg = avgMap.get(dateStr) ?? null;
    data.push({
      date: dateStr,
      avgMinutes: avg !== null ? Math.round(avg * 10) / 10 : null,
    });
  }

  return { data };
}

// ─── Category breakdown (GET /dashboard/category-breakdown) ───
//
// Returns the count of orders per category for a given month.
// Uses order_items to determine which categories each order touched
// (an order with both grocery and medicine items counts in both).
//
// We join order_items → products → categories to get the category per item,
// then COUNT(DISTINCT order_id) per category so each order is counted once
// per category it has items in.

export async function getCategoryBreakdown(
  query: CategoryBreakdownQuery,
  ctx: DashboardContext,
): Promise<{ data: CategoryBreakdownPoint[] }> {
  const now = new Date();
  const month =
    query.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const { start: monthStart, end: monthEnd } = parseMonthRange(month);

  const isSuperAdmin = ctx.role === 'super_admin';

  const rows = isSuperAdmin
    ? await prisma.$queryRaw<Array<{ slug: string; name: string; order_count: bigint }>>`
        SELECT
          c.slug,
          c.name,
          COUNT(DISTINCT oi.order_id)::bigint AS order_count
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN categories c ON c.id = p.category_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${monthStart}
          AND o.delivered_at < ${monthEnd}
        GROUP BY c.slug, c.name
        ORDER BY order_count DESC
      `
    : await prisma.$queryRaw<Array<{ slug: string; name: string; order_count: bigint }>>`
        SELECT
          c.slug,
          c.name,
          COUNT(DISTINCT oi.order_id)::bigint AS order_count
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN categories c ON c.id = p.category_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${monthStart}
          AND o.delivered_at < ${monthEnd}
          AND o.user_id = ${ctx.userId}
        GROUP BY c.slug, c.name
        ORDER BY order_count DESC
      `;

  const data: CategoryBreakdownPoint[] = rows.map((r) => ({
    categorySlug: r.slug,
    categoryName: r.name,
    orderCount: Number(r.order_count),
  }));

  return { data };
}
