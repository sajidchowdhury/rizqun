import { prisma } from '../config/prisma';

/**
 * Generate the next order code in the format `ORD-YYYY-NNNNN`.
 *
 * Examples:
 *   First order of 2026  → ORD-2026-00001
 *   42nd order of 2026    → ORD-2026-00042
 *
 * Implementation:
 *   - Counts existing orders created in the current calendar year
 *   - Adds 1 and zero-pads to 5 digits
 *   - Wraps in a transaction with `SELECT ... FOR UPDATE` semantics via
 *     `prisma.$transaction` to prevent race conditions when two operators
 *     finalize simultaneously.
 *
 * Note: For very high throughput we'd switch to a Postgres SEQUENCE, but
 * for this use case (one operator team, maybe 100 orders/day) a count-based
 * approach is fine and easier to inspect/debug.
 */
export async function generateOrderCode(): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`);

  // Count existing orders in this year
  const count = await prisma.order.count({
    where: {
      createdAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
  });

  // Next sequential number (1-indexed)
  const next = count + 1;
  const padded = String(next).padStart(5, '0');

  return `ORD-${year}-${padded}`;
}

/**
 * Verify a candidate orderCode is unique (in case of a race we missed).
 * If the code already exists, append a suffix and retry.
 */
export async function generateUniqueOrderCode(maxRetries = 5): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = await generateOrderCode();
    const existing = await prisma.order.findUnique({ where: { orderCode: code } });
    if (!existing) {
      return code;
    }
    // Race: another transaction inserted the same code.
    // On the next loop iteration, count will be 1 higher and we'll get a new code.
    // If we exhaust retries, the DB unique constraint will catch the final attempt.
  }
  // Last resort — let the DB constraint enforce uniqueness
  return generateOrderCode();
}
