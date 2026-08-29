import { useMemo, useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { useCart } from '@/hooks/use-cart';
import { useFinalizeOrder } from '@/hooks/use-orders';
import { formatBDT } from '@/contexts/cart-store';
import { validateCustomer } from '@/lib/customer-validation';
import { OrderProductCatalog } from '@/components/orders/order-product-catalog';
import { CustomerPicker } from '@/components/orders/customer-picker';
import { CartPanel } from '@/components/orders/cart-panel';

export function NewOrderPage() {
  const { items, customer, deliveryFee, totals, itemCount, clearAll } = useCart();
  const finalizeOrder = useFinalizeOrder();

  // Validation is derived from the cart store's customer info — no extra
  // state needed. The CustomerPicker shows inline errors on its own,
  // and the parent uses the same `validateCustomer` helper to gate the
  // Finalize button.
  const cartEmpty = itemCount === 0;
  const errors = useMemo(() => validateCustomer(customer), [customer]);
  const canFinalize =
    !cartEmpty && !errors.name && !errors.phone && !finalizeOrder.isPending;

  function handleFinalize() {
    if (!canFinalize) return;
    finalizeOrder.mutate(
      {
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim(),
        customerAddress: customer.address.trim() || undefined,
        deliveryFee,
        items: items.map((item) => ({ productId: item.productId, qty: item.qty })),
      },
      {
        onSuccess: () => {
          clearAll();
          // Close the cart offcanvas after a successful finalize so the
          // operator sees the "Order created" toast + gets sent to /orders/pending
          setCartOpen(false);
        },
      },
    );
  }

  // Finalize button label — keeps the operator oriented ("what am I about
  // to submit?") without having to scroll to the cart.
  const finalizeLabel = cartEmpty
    ? 'Add a product to finalize'
    : `Finalize order · ${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatBDT(totals.total)}`;

  // Cart offcanvas state — open when the floating cart button is clicked
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-0">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Order</h1>
          <p className="text-sm text-muted-foreground">
            Search products, add to cart. When the call wraps up, open the cart to fill customer info + finalize.
          </p>
        </div>
        <div className="hidden items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground sm:flex">
          <span>Subtotal</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {formatBDT(totals.subtotal)}
          </span>
        </div>
      </header>

      {/* Catalog — full-width (no more right sidebar with customer card).
          The catalog grid uses 5 columns on xl so the cards match the
          /products page. The grid is wrapped in `min-w-0` to defeat the
          CSS Grid min-content sizing gotcha (see commit 0ce22c8). */}
      <div className="min-w-0">
        <OrderProductCatalog />
      </div>

      {/* Floating cart button — bottom-left, persistent.
          Shows the cart count + total. Hidden when cart is empty (no
          clutter on first load) and when the offcanvas is open (the
          offcanvas has its own header). */}
      {itemCount > 0 && !cartOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 z-30 flex items-center gap-3 rounded-full bg-commerce px-4 py-3 text-commerce-foreground shadow-lg transition-transform active:scale-[0.97]"
          aria-label="Open cart"
        >
          <span className="relative">
            <ShoppingCart className="size-5" />
            <span className="absolute -right-2 -top-2 inline-flex size-5 items-center justify-center rounded-full bg-commerce-foreground text-[11px] font-bold text-commerce">
              {itemCount}
            </span>
          </span>
          <span className="hidden text-sm font-semibold sm:inline">View cart</span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatBDT(totals.total)}
          </span>
        </button>
      )}

      {/* Cart offcanvas — slide-over from the right.
          Contains: customer picker + cart panel with line items, totals,
          delivery fee, and the finalize button. Built on Radix Dialog
          with custom positioning (anchored right, slides in from right). */}
      <CartOffcanvas
        open={cartOpen}
        onOpenChange={setCartOpen}
        itemCount={itemCount}
        onFinalize={handleFinalize}
        canFinalize={canFinalize}
        isFinalizing={finalizeOrder.isPending}
        finalizeLabel={finalizeLabel}
        busy={finalizeOrder.isPending}
      />
    </div>
  );
}

// ─── Cart offcanvas (slide-over from the right) ───────────────
//
// Built on Radix Dialog primitives (same as the existing mobile cart tray)
// but anchored to the right edge of the screen, sliding in from the right.
// Contains the customer picker + cart panel + finalize button.

interface CartOffcanvasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemCount: number;
  onFinalize: () => void;
  canFinalize: boolean;
  isFinalizing: boolean;
  finalizeLabel: string;
  busy?: boolean;
}

function CartOffcanvas({
  open,
  onOpenChange,
  itemCount,
  onFinalize,
  canFinalize,
  isFinalizing,
  finalizeLabel,
  busy,
}: CartOffcanvasProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            // Anchor to the right edge, slide in from the right.
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-0 border-l bg-background p-0 shadow-lg outline-none',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            'duration-300',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ShoppingCart className="size-4" />
              Cart
              {itemCount > 0 && (
                <span className="rounded-full bg-commerce px-2 py-0.5 text-[11px] font-semibold text-commerce-foreground">
                  {itemCount}
                </span>
              )}
            </DialogTitle>
            <DialogPrimitive.Close
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close cart"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Body — scrollable. Contains the customer picker + cart panel. */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 p-4">
              {/* Customer picker — search repeat customers + new customer form.
                  Shown first because the operator fills this in last (after
                  adding all the products), so it's at the top of the cart
                  offcanvas. */}
              <div>
                <h3 className="mb-3 text-sm font-semibold">Customer</h3>
                <CustomerPicker />
              </div>

              <div className="h-px bg-border" />

              {/* Cart line items + totals + finalize button */}
              <div>
                <h3 className="mb-3 text-sm font-semibold">Order summary</h3>
                <CartPanel
                  onFinalize={onFinalize}
                  canFinalize={canFinalize}
                  isFinalizing={isFinalizing}
                  finalizeLabel={finalizeLabel}
                  busy={busy}
                />
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
