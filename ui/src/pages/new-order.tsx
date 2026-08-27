import { useMemo, useState } from 'react';
import { Check, Plus, User } from 'lucide-react';

import { cn } from '@/lib/utils';
import { validateCustomer } from '@/lib/customer-validation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCart } from '@/hooks/use-cart';
import { useFinalizeOrder } from '@/hooks/use-orders';
import { formatBDT } from '@/contexts/cart-store';
import { OrderProductCatalog } from '@/components/orders/order-product-catalog';
import { CustomerPicker } from '@/components/orders/customer-picker';
import { CartSidebar, MobileCartTray } from '@/components/orders/cart-panel';

export function NewOrderPage() {
  const { items, customer, deliveryFee, subtotal, totals, itemCount, clearAll } = useCart();
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
        },
      },
    );
  }

  // Finalize button label — keeps the operator oriented ("what am I about
  // to submit?") without having to scroll to the cart.
  const finalizeLabel = cartEmpty
    ? 'Add a product to finalize'
    : `Finalize order · ${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatBDT(totals.total)}`;

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-0">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">New Order</h1>
            <p className="text-sm text-muted-foreground">
              Browse, search, and add to the cart — then finalize to send it to the kitchen.
            </p>
          </div>
          <div className="hidden items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span>Subtotal</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {formatBDT(subtotal)}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile customer pill — opens the CustomerPicker in a bottom
          sheet so the catalog can use the full mobile viewport. */}
      <MobileCustomerPill name={customer.name} phone={customer.phone} />

      {/* Main layout:
          - Mobile: catalog full-width; cart is the floating bottom tray
          - Desktop (lg+): catalog left, sticky sidebar right with
            customer picker + cart panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_400px]">
        {/* Catalog — always full-width on its column */}
        <OrderProductCatalog />

        {/* Desktop right sidebar */}
        <aside className="hidden lg:block">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomerPicker />
              </CardContent>
            </Card>
            <CartSidebar
              onFinalize={handleFinalize}
              canFinalize={canFinalize}
              isFinalizing={finalizeOrder.isPending}
              finalizeLabel={finalizeLabel}
              busy={finalizeOrder.isPending}
            />
          </div>
        </aside>
      </div>

      {/* Mobile cart tray — floating button + slide-up sheet. Renders null
          when the cart is empty so the screen stays uncluttered. */}
      <MobileCartTray
        onFinalize={handleFinalize}
        canFinalize={canFinalize}
        isFinalizing={finalizeOrder.isPending}
        finalizeLabel={finalizeLabel}
        busy={finalizeOrder.isPending}
      />
    </div>
  );
}

// ─── Mobile customer pill ──────────────────────────────────────
//
// Compact "Customer" toggle that opens the CustomerPicker in a bottom
// sheet on mobile. Renders as a horizontal pill row so it doesn't eat
// vertical space the catalog needs.

interface MobileCustomerPillProps {
  name: string;
  phone: string;
}

function MobileCustomerPill({ name, phone }: MobileCustomerPillProps) {
  const [open, setOpen] = useState(false);
  const filled = name.trim().length > 0 || phone.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-colors',
          'hover:bg-accent lg:hidden',
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-full bg-commerce-soft text-commerce-soft-foreground">
          <User className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          {filled ? (
            <>
              <div className="truncate text-sm font-medium">
                {name || <span className="text-muted-foreground">No name</span>}
              </div>
              {phone && (
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {phone}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm font-medium">Select or add customer</div>
          )}
        </div>
        {filled ? (
          <span className="rounded-full bg-commerce-soft px-2 py-0.5 text-[11px] font-medium text-commerce-soft-foreground">
            Edit
          </span>
        ) : (
          <Plus className="size-4 text-muted-foreground" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-auto bottom-0 left-0 right-0 max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none p-0 sm:max-w-none">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <DialogTitle className="text-base font-semibold">Customer</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="rounded-full"
            >
              <Check className="size-4" />
              Done
            </Button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <CustomerPicker />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
