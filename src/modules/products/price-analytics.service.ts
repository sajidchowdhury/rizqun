// ─── Price analytics service (Phase 5, 2026-08-28) ───────────────
//
// Three analytics views for the /prices/history page:
//
// 1. Per-product price-over-time chart
//    GET /products/:id/price-history  (already exists from Phase 1)
//    Returns the audit log of every price change for one product.
//
// 2. Vendor stability ranking
//    GET /dashboard/vendor-stability?days=30
//    Per vendor: how many price changes in the last N days, average
//    change magnitude (avg |newPrice - oldPrice|), and the most recent
//    change date. Used to answer "which vendor changes prices most
//    often?" — vendors with fewer changes are more stable.
//
// 3. Profit-per-vendor report
//    GET /dashboard/vendor-profitability?month=2026-08
//    Per vendor: total margin (sum of (priceSnapshot - purchasePriceSnapshot)
//    × qty) across delivered orders in the target month. Used to answer
//    "which vendor is most profitable with us in the long run?"
//
// All three endpoints are role-scoped:
//   - super_admin → sees all data
//   - regular user → sees only their own orders (for profitability) /
//     all price history (since price changes are shop-wide, not per-user)

import { type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

// ─── Types ─────────────────────────────────────────────────────

export interface VendorStabilityRow {
  vendorId: number;
  vendorName: string;
  // Number of price changes logged in the last N days (from
  // ProductPriceHistory where vendorId matches and changedAt >= startDate)
  changeCount: number;
  // Average absolute change magnitude across all price changes
  // (avg of |newSalePrice - prevSalePrice| and |newPurchasePrice -
  // prevPurchasePrice|, weighted evenly). 0 if no changes.
  avgChangeMagnitude: number;
  // Most recent change date (ISO string), or null if no changes
  lastChangeAt: string | null;
}

export interface VendorStabilityQuery {
  days?: number;
}

// ─── Vendor stability ──────────────────────────────────────────
//
// For each vendor, count the number of price changes logged in the
// last N days + compute the average absolute change magnitude.
//
// We use ProductPriceHistory rows where vendorId is set (i.e. vendor-
// specific purchase price changes — these are the rows that tell us
// "this vendor's price for product X changed"). Product-level changes
// (vendorId = null) are excluded because they're not about a specific
// vendor.
//
// The change magnitude is computed by comparing each row's prices to
// the previous row's prices for the same (productId, vendorId) pair.
// We use a window function (LAG) for this.
//
// Returns: array sorted by changeCount descending (most-changed vendors
// first). Vendors with zero changes are NOT included (they're stable —
// nothing to report).

export async function getVendorStability(
  query: VendorStabilityQuery = {},
): Promise<{ data: VendorStabilityRow[] }> {
  const days = Math.min(Math.max(query.days ?? 30, 1), 365);
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  startDate.setUTCHours(0, 0, 0, 0);

  // ─── Compute change count + last change per vendor ─────────
  const countRows = await prisma.$queryRaw<
    Array<{ vendor_id: number; vendor_name: string; change_count: bigint; last_change_at: Date | null }>
  >`
    SELECT
      v.id   AS vendor_id,
      v.name AS vendor_name,
      COUNT(ph.id)::bigint AS change_count,
      MAX(ph.changed_at)  AS last_change_at
    FROM product_price_history ph
    JOIN vendors v ON v.id = ph.vendor_id
    WHERE ph.vendor_id IS NOT NULL
      AND ph.changed_at >= ${startDate}
    GROUP BY v.id, v.name
    ORDER BY change_count DESC, v.name ASC
  `;

  if (countRows.length === 0) {
    return { data: [] };
  }

  // ─── Compute average change magnitude per vendor ───────────
  // For each (product_id, vendor_id) pair, compute |new - prev| for
  // both salePrice and purchasePrice, then average across all changes.
  // We use LAG to get the previous row's prices.

  const magnitudeRows = await prisma.$queryRaw<
    Array<{
      vendor_id: number;
      avg_magnitude: number | null;
    }>
  >`
    WITH changes AS (
      SELECT
        ph.vendor_id,
        ph.product_id,
        ph.sale_price,
        ph.purchase_price,
        LAG(ph.sale_price)     OVER (PARTITION BY ph.product_id, ph.vendor_id ORDER BY ph.changed_at, ph.id) AS prev_sale,
        LAG(ph.purchase_price) OVER (PARTITION BY ph.product_id, ph.vendor_id ORDER BY ph.changed_at, ph.id) AS prev_purchase,
        ph.changed_at
      FROM product_price_history ph
      WHERE ph.vendor_id IS NOT NULL
        AND ph.changed_at >= ${startDate}
    )
    SELECT
      vendor_id,
      AVG(
        (ABS(sale_price - COALESCE(prev_sale, sale_price)) +
         ABS(purchase_price - COALESCE(prev_purchase, purchase_price))) / 2.0
      )::float AS avg_magnitude
    FROM changes
    WHERE prev_sale IS NOT NULL OR prev_purchase IS NOT NULL
    GROUP BY vendor_id
  `;

  // Build a lookup: vendorId → avgMagnitude
  const magnitudeMap = new Map<number, number>();
  for (const row of magnitudeRows) {
    magnitudeMap.set(row.vendor_id, row.avg_magnitude ?? 0);
  }

  // Merge the two result sets
  const data: VendorStabilityRow[] = countRows.map((r) => ({
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    changeCount: Number(r.change_count),
    avgChangeMagnitude: Math.round((magnitudeMap.get(r.vendor_id) ?? 0) * 100) / 100,
    lastChangeAt: r.last_change_at ? r.last_change_at.toISOString() : null,
  }));

  return { data };
}

// ─── Vendor profitability ──────────────────────────────────────
//
// For each vendor, compute the total profit margin across delivered
// orders in the target month. Margin = (priceSnapshot - purchasePriceSnapshot)
// × qty per order item, summed across all delivered orders in the month.
//
// This answers: "which vendor is most profitable with us in the long
// run?" — vendors with higher total margin are the ones we should keep
// working with.
//
// Role-scoped: regular users see only their own orders; super_admin sees all.

export interface VendorProfitabilityRow {
  vendorId: number;
  vendorName: string;
  // Number of delivered orders in the month that include items from this vendor
  orderCount: number;
  // Total margin = sum((priceSnapshot - purchasePriceSnapshot) × qty)
  totalMargin: string;
  // Total revenue (sum of lineTotal) — for reference
  totalRevenue: string;
}

export interface VendorProfitabilityQuery {
  month?: string; // 'YYYY-MM'
}

interface AnalyticsContext {
  userId: number;
  role: string;
}

function parseMonthRange(monthStr: string): { start: Date; end: Date } {
  const [yearStr, monStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monStr, 10);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export async function getVendorProfitability(
  query: VendorProfitabilityQuery = {},
  ctx: AnalyticsContext,
): Promise<{ data: VendorProfitabilityRow[]; month: string }> {
  const now = new Date();
  const month =
    query.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const { start: monthStart, end: monthEnd } = parseMonthRange(month);

  const isSuperAdmin = ctx.role === 'super_admin';

  const rows = isSuperAdmin
    ? await prisma.$queryRaw<
        Array<{
          vendor_id: number;
          vendor_name: string;
          order_count: bigint;
          total_margin: Prisma.Decimal;
          total_revenue: Prisma.Decimal;
        }>
      >`
        SELECT
          v.id   AS vendor_id,
          v.name AS vendor_name,
          COUNT(DISTINCT o.id)::bigint AS order_count,
          SUM((oi.price_snapshot - oi.purchase_price_snapshot) * oi.qty)::decimal AS total_margin,
          SUM(oi.line_total)::decimal AS total_revenue
        FROM order_items oi
        JOIN vendors v  ON v.id = oi.vendor_id
        JOIN orders o   ON o.id = oi.order_id
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${monthStart}
          AND o.delivered_at <  ${monthEnd}
        GROUP BY v.id, v.name
        ORDER BY total_margin DESC
      `
    : await prisma.$queryRaw<
        Array<{
          vendor_id: number;
          vendor_name: string;
          order_count: bigint;
          total_margin: Prisma.Decimal;
          total_revenue: Prisma.Decimal;
        }>
      >`
        SELECT
          v.id   AS vendor_id,
          v.name AS vendor_name,
          COUNT(DISTINCT o.id)::bigint AS order_count,
          SUM((oi.price_snapshot - oi.purchase_price_snapshot) * oi.qty)::decimal AS total_margin,
          SUM(oi.line_total)::decimal AS total_revenue
        FROM order_items oi
        JOIN vendors v  ON v.id = oi.vendor_id
        JOIN orders o   ON o.id = oi.order_id
        WHERE o.status = 'delivered'
          AND o.delivered_at >= ${monthStart}
          AND o.delivered_at <  ${monthEnd}
          AND o.user_id = ${ctx.userId}
        GROUP BY v.id, v.name
        ORDER BY total_margin DESC
      `;

  const data: VendorProfitabilityRow[] = rows.map((r) => ({
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    orderCount: Number(r.order_count),
    totalMargin: r.total_margin.toString(),
    totalRevenue: r.total_revenue.toString(),
  }));

  return { data, month };
}
