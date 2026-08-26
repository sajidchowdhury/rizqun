import { useMemo } from 'react';

import {
  useCartStore,
  computeItemCount,
  computeSubtotal,
  computeTotals,
} from '@/contexts/cart-store';

/**
 * Convenience hook over the cart store. Returns the raw state + actions
 * along with memoized computed totals (subtotal, total item count,
 * grand total = subtotal + deliveryFee).
 *
 * Usage:
 *   const { items, addItem, totals, itemCount } = useCart()
 *
 * Components that only need actions (no totals) can use `useCartStore`
 * directly to avoid re-rendering on every cart change.
 */
export function useCart() {
  const items = useCartStore((s) => s.items);
  const customer = useCartStore((s) => s.customer);
  const deliveryFee = useCartStore((s) => s.deliveryFee);

  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const setQty = useCartStore((s) => s.setQty);
  const incrementQty = useCartStore((s) => s.incrementQty);
  const decrementQty = useCartStore((s) => s.decrementQty);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const setDeliveryFee = useCartStore((s) => s.setDeliveryFee);
  const clearItems = useCartStore((s) => s.clearItems);
  const clearAll = useCartStore((s) => s.clearAll);

  const subtotal = useMemo(() => computeSubtotal(items), [items]);
  const itemCount = useMemo(() => computeItemCount(items), [items]);
  const totals = useMemo(() => computeTotals(items, deliveryFee), [items, deliveryFee]);

  return {
    // State
    items,
    customer,
    deliveryFee,
    // Computed
    subtotal,
    itemCount,
    totals,
    // Actions
    addItem,
    removeItem,
    setQty,
    incrementQty,
    decrementQty,
    setCustomer,
    setDeliveryFee,
    clearItems,
    clearAll,
  };
}
