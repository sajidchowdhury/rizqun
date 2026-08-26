import { useState } from 'react';
import { PackagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/hooks/use-cart';
import { formatBDT } from '@/contexts/cart-store';
import { ProductPicker } from '@/components/orders/product-picker';
import { CartSidebar } from '@/components/orders/cart-sidebar';

export function NewOrderPage() {
  const { customer, deliveryFee, subtotal, totals, itemCount, setCustomer, setDeliveryFee } =
    useCart();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Order</h1>
          <p className="text-sm text-muted-foreground">
            Build the cart, fill in customer info, then finalize the order.
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)}>
          <PackagePlus className="size-4" />
          Add product
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: Customer info form */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer information</CardTitle>
              <CardDescription>
                Required: name + phone. Address is optional but useful for delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="customer-name">Customer name</Label>
                <Input
                  id="customer-name"
                  value={customer.name}
                  onChange={(e) => setCustomer({ name: e.target.value })}
                  placeholder="e.g. John Doe"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-phone">Customer phone</Label>
                <Input
                  id="customer-phone"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ phone: e.target.value })}
                  placeholder="e.g. 01712345678"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-address">Customer address (optional)</Label>
                <Input
                  id="customer-address"
                  value={customer.address}
                  onChange={(e) => setCustomer({ address: e.target.value })}
                  placeholder="e.g. House 1, Road 2, Dhaka"
                  autoComplete="off"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery fee</CardTitle>
              <CardDescription>Added to the subtotal to compute the order total.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <Label htmlFor="delivery-fee">Delivery fee (৳)</Label>
                <Input
                  id="delivery-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                  className="max-w-[160px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Finalize placeholder — Phase 3.4 will turn this into a real button */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Finalize order</CardTitle>
              <CardDescription>
                Coming in Phase 3.4 — the button will POST the cart to <code>/orders</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled className="w-full">
                Finalize order ({itemCount} items · {formatBDT(totals.total)})
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Cart subtotal: <span className="font-mono">{formatBDT(subtotal)}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Cart sidebar (sticky) */}
        <CartSidebar />
      </div>

      {/* Product picker modal */}
      <ProductPicker open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
}
