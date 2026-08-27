import { useState } from 'react';
import { Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogTitle, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { useCart } from '@/hooks/use-cart';
import { formatBDT } from '@/contexts/cart-store';

// ─── Shared cart panel ─────────────────────────────────────────
//
// Renders the cart line items (with image thumbnails), inline qty
// steppers, a delivery-fee input, the subtotal / delivery / total
// summary, and a prominent Finalize CTA. Used by both the desktop
// sticky sidebar and the mobile slide-up tray.

interface CartPanelProps {
  onFinalize: () => void;
  canFinalize: boolean;
  isFinalizing: boolean;
  finalizeLabel: string;
  /** Disable the delivery fee input (e.g. while finalizing). */
  busy?: boolean;
}

function CartPanel({
  onFinalize,
  canFinalize,
  isFinalizing,
  finalizeLabel,
  busy,
}: CartPanelProps) {
  const {
    items,
    itemCount,
    subtotal,
    deliveryFee,
    totals,
    incrementQty,
    decrementQty,
    removeItem,
    clearItems,
    setDeliveryFee,
  } = useCart();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
        <ShoppingCart className="size-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium">Your cart is empty</p>
        <p className="text-xs text-muted-foreground">
          Browse the catalog and tap <span className="font-medium">Add</span> on a product.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Line items */}
      <div className="space-y-2">
        {items.map((item) => {
          // The cart item snapshot carries the product's image URL when
          // available (added to the cart store on 2026-08-27). Fall back
          // to a letter avatar when missing so the cart stays scannable.
          const url = imageUrl(item.imageUrl ?? null);
          const initial = item.name.trim().charAt(0).toUpperCase() || '?';
          return (
            <div
              key={item.productId}
              className="flex gap-2.5 rounded-lg border bg-background p-2.5"
            >
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-commerce-soft text-base font-semibold text-commerce-soft-foreground">
                {url ? (
                  <img
                    src={url}
                    alt={item.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={item.name}>
                      {item.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {item.categoryName} · {item.vendorName} · {item.unit}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeItem(item.productId)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => decrementQty(item.productId)}
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="min-w-6 text-center font-mono text-sm font-medium tabular-nums">
                      {item.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => incrementQty(item.productId)}
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      <Plus className="size-3" />
                    </Button>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      × {formatBDT(Number(item.price))}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatBDT(Number(item.price) * item.qty)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delivery fee inline */}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <Label htmlFor="delivery-fee-inline" className="text-xs font-medium text-muted-foreground">
          Delivery fee
        </Label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">৳</span>
          <Input
            id="delivery-fee-inline"
            type="number"
            min="0"
            step="0.01"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
            disabled={busy}
            className="h-8 w-20 border-transparent bg-background text-right font-mono text-sm tabular-nums"
          />
        </div>
      </div>

      <Separator />

      {/* Totals */}
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-mono tabular-nums">{formatBDT(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Delivery fee</span>
          <span className="font-mono tabular-nums">{formatBDT(deliveryFee)}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between text-base font-semibold">
          <span>Total</span>
          <span className="font-mono tabular-nums text-commerce">
            {formatBDT(totals.total)}
          </span>
        </div>
      </div>

      {/* Finalize CTA */}
      <Button
        onClick={onFinalize}
        disabled={!canFinalize}
        className="h-11 w-full rounded-full bg-commerce text-commerce-foreground hover:bg-commerce/90"
      >
        {isFinalizing ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Creating order…
          </>
        ) : (
          finalizeLabel
        )}
      </Button>

      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-muted-foreground">
          {itemCount} item{itemCount === 1 ? '' : 's'} in cart
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={clearItems}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
          Clear cart
        </Button>
      </div>
    </div>
  );
}

// ─── Desktop sticky sidebar ────────────────────────────────────

export function CartSidebar(props: CartPanelProps) {
  const { itemCount } = useCart();
  return (
    <div className="sticky top-20 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="size-4" />
          Cart
          {itemCount > 0 && (
            <span className="rounded-full bg-commerce px-2 py-0.5 text-[11px] font-semibold text-commerce-foreground">
              {itemCount}
            </span>
          )}
        </h2>
      </div>
      <CartPanel {...props} />
    </div>
  );
}

// ─── Mobile slide-up tray ──────────────────────────────────────
//
// Self-contained: renders a floating "View cart" button at the bottom
// of the viewport and opens a slide-up sheet with the cart panel.
// Only the parent needs to pass the finalize handler + validation flags.

export function MobileCartTray(props: CartPanelProps) {
  const { itemCount, totals } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating bottom bar (mobile-only — hidden on sm+ where the
          desktop sidebar is visible). Hidden when the cart is empty so
          the screen stays uncluttered. */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-full bg-commerce px-4 py-3 text-commerce-foreground shadow-lg transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-commerce-foreground/20 text-xs">
                {itemCount}
              </span>
              View cart
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {formatBDT(totals.total)}
            </span>
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            className={cn(
              // Override the default center-positioned DialogContent classes:
              // we want a bottom-anchored sheet that slides up.
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-0 rounded-t-2xl border bg-background p-0 shadow-lg outline-none',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
              'duration-300',
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-10 rounded-full bg-muted" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2 pt-3">
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

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <CartPanel {...props} />
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </>
  );
}
