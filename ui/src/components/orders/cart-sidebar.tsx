import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCart } from '@/hooks/use-cart';
import { formatBDT } from '@/contexts/cart-store';

export function CartSidebar() {
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
  } = useCart();

  return (
    <Card className="sticky top-20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4" />
            Cart
            {itemCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {itemCount}
              </span>
            )}
          </CardTitle>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearItems}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <ShoppingCart className="mx-auto mb-2 size-8 opacity-40" />
            Cart is empty.
            <br />
            Click "Add product" to start.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.productId} className="space-y-1 rounded-md border p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.categoryName} · {item.vendorName}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(item.productId)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => decrementQty(item.productId)}
                        aria-label={`Decrease ${item.name} quantity`}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="min-w-6 text-center font-mono text-sm">{item.qty}</span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => incrementQty(item.productId)}
                        aria-label={`Increase ${item.name} quantity`}
                      >
                        <Plus className="size-3" />
                      </Button>
                      <span className="ml-1 text-xs text-muted-foreground">
                        × {formatBDT(Number(item.price))}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-medium">
                      {formatBDT(Number(item.price) * item.qty)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatBDT(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery fee</span>
                <span className="font-mono">{formatBDT(deliveryFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-medium">
                <span>Total</span>
                <span className="font-mono">{formatBDT(totals.total)}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
