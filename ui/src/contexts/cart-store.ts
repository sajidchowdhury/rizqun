import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { CartItem, CustomerInfo } from '@/types/cart';

// ─── Store shape ──────────────────────────────────────────────────────

interface CartState {
  items: CartItem[];
  customer: CustomerInfo;
  deliveryFee: number;

  // ─── Actions ───────────────────────────────────────────────────────
  /** Add a product to the cart. If the same productId is already in the
   *  cart, increments its qty by `qty` (default 1). */
  addItem: (item: Omit<CartItem, 'qty'> & { qty?: number }) => void;
  /** Remove an item from the cart by productId. No-op if not present. */
  removeItem: (productId: number) => void;
  /** Set the qty of an existing cart item. If qty <= 0, removes the item. */
  setQty: (productId: number, qty: number) => void;
  /** Increment the qty of an existing cart item by 1. */
  incrementQty: (productId: number) => void;
  /** Decrement the qty of an existing cart item by 1. Removes if reaches 0. */
  decrementQty: (productId: number) => void;
  /** Update customer info (partial — merges with existing). */
  setCustomer: (info: Partial<CustomerInfo>) => void;
  /** Set the delivery fee. Must be >= 0. */
  setDeliveryFee: (fee: number) => void;
  /** Clear all items from the cart. Customer info + deliveryFee are preserved. */
  clearItems: () => void;
  /** Full reset — clear items, customer info, and deliveryFee.
   *  Called after a successful POST /orders to start a fresh cart. */
  clearAll: () => void;
}

// ─── Default values ──────────────────────────────────────────────────

const DEFAULT_CUSTOMER: CustomerInfo = {
  name: '',
  phone: '',
  address: '',
};

const DEFAULT_DELIVERY_FEE = 0;

// ─── Helpers ────────────────────────────────────────────────────────

/** Parse a Decimal-string price to a JS number. Returns 0 if invalid. */
function priceToNumber(price: string): number {
  const n = Number(price);
  return Number.isFinite(n) ? n : 0;
}

// ─── Store ──────────────────────────────────────────────────────────

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      customer: DEFAULT_CUSTOMER,
      deliveryFee: DEFAULT_DELIVERY_FEE,

      addItem: (item) =>
        set((state) => {
          const qty = item.qty ?? 1;
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId ? { ...i, qty: i.qty + qty } : i,
              ),
            };
          }
          return {
            items: [...state.items, { ...item, qty }],
          };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),

      setQty: (productId, qty) =>
        set((state) => {
          if (qty <= 0) {
            return { items: state.items.filter((i) => i.productId !== productId) };
          }
          return {
            items: state.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
          };
        }),

      incrementQty: (productId) =>
        set((state) => ({
          items: state.items.map((i) => (i.productId === productId ? { ...i, qty: i.qty + 1 } : i)),
        })),

      decrementQty: (productId) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === productId);
          if (!existing) return state;
          if (existing.qty <= 1) {
            return { items: state.items.filter((i) => i.productId !== productId) };
          }
          return {
            items: state.items.map((i) =>
              i.productId === productId ? { ...i, qty: i.qty - 1 } : i,
            ),
          };
        }),

      setCustomer: (info) =>
        set((state) => ({
          customer: { ...state.customer, ...info },
        })),

      setDeliveryFee: (fee) =>
        set(() => ({
          deliveryFee: Math.max(0, fee),
        })),

      clearItems: () => set(() => ({ items: [] })),

      clearAll: () =>
        set(() => ({
          items: [],
          customer: DEFAULT_CUSTOMER,
          deliveryFee: DEFAULT_DELIVERY_FEE,
        })),
    }),
    {
      name: 'rizqun-ui-cart',
      // sessionStorage so the cart survives F5 but is cleared on tab close
      // (matches the auth token behavior — never written to localStorage).
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the data, not the action functions.
      partialize: (state) => ({
        items: state.items,
        customer: state.customer,
        deliveryFee: state.deliveryFee,
      }),
    },
  ),
);

// ─── Computed selectors (use as plain functions in components) ─────────

/** Returns the subtotal (sum of price * qty) for the given items. */
export function computeSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + priceToNumber(item.price) * item.qty, 0);
}

/** Returns the total item count (sum of all qty values). */
export function computeItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

/** Returns the cart totals object: subtotal, deliveryFee, total. */
export function computeTotals(
  items: CartItem[],
  deliveryFee: number,
): {
  subtotal: number;
  deliveryFee: number;
  total: number;
} {
  const subtotal = computeSubtotal(items);
  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
  };
}

/** Format a number as BDT currency (৳). */
const bdtFormatter = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  minimumFractionDigits: 2,
});

export function formatBDT(amount: number): string {
  return bdtFormatter.format(amount);
}
