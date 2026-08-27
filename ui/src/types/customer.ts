/**
 * Derived customer record from past orders.
 *
 * Rizqun doesn't have a standalone customers table — customer info is
 * denormalized onto each order row. This derived type is built client-side
 * by de-duplicating recent orders by phone number, so the operator can
 * quickly re-select a repeat customer without re-typing their info.
 */
export interface RecentCustomer {
  /** Stable key — the customer phone (normalised). */
  phone: string;
  name: string;
  /** Optional — null for repeat customers because past orders list doesn't
   *  return address. The operator can fill it in once for the new order. */
  address: string | null;
  /** Count of past orders for this phone — used for the "x orders" badge. */
  orderCount: number;
  /** ISO timestamp of the most recent order for this phone. */
  lastOrderAt: string;
  /** Order code of the most recent order (e.g. RZ-2026-00123) — purely cosmetic. */
  lastOrderCode: string;
}
