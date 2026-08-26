/**
 * Cart types — the in-memory representation of the operator's active cart.
 *
 * The cart lives in a zustand store (src/contexts/cart-store.ts) and is
 * persisted to sessionStorage so a tab refresh doesn't lose work.
 *
 * CartItem snapshots the product at the time it was added so the cart
 * stays correct even if the product is later renamed or repriced. The
 * productId is included so the finalize POST can reference it.
 */

export interface CartItem {
  /** Product ID from the catalog (or 0 for a quick-added custom product
   *  that hasn't been created yet — Phase 3.3 will handle this). */
  productId: number;
  name: string;
  /** Price per unit at the time of adding (string to preserve Decimal precision). */
  price: string;
  qty: number;
  vendorId: number;
  vendorName: string;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  unit: string;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
}

// ─── Computed totals (derived from items + deliveryFee) ─────────────

export interface CartTotals {
  subtotal: number;
  deliveryFee: number;
  total: number;
}

// ─── Finalize payload shape (sent to POST /orders) ───────────────────

export interface FinalizeOrderPayload {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryFee: number;
  items: Array<{ productId: number; qty: number }>;
}
