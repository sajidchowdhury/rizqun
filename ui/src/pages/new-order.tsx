import { useState } from 'react';
import { Loader2, PackagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/hooks/use-cart';
import { useFinalizeOrder } from '@/hooks/use-orders';
import { formatBDT } from '@/contexts/cart-store';
import { ProductPicker } from '@/components/orders/product-picker';
import { CartSidebar } from '@/components/orders/cart-sidebar';

export function NewOrderPage() {
  const {
    items,
    customer,
    deliveryFee,
    subtotal,
    totals,
    itemCount,
    setCustomer,
    setDeliveryFee,
    clearAll,
  } = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const finalizeOrder = useFinalizeOrder();

  // Inline validation (not using zod resolver here because the form
  // values live in the zustand store, not react-hook-form state).
  const customerNameError =
    customer.name.trim().length < 2 ? 'Name must be at least 2 characters' : null;
  const customerPhoneError =
    customer.phone.trim().length === 0
      ? 'Phone is required'
      : !/^(\+?880|0)1[3-9]\d{8}$/.test(customer.phone.trim())
        ? 'Must be a valid Bangladeshi number (e.g. 017XXXXXXXX)'
        : null;
  const cartEmpty = itemCount === 0;

  const canFinalize =
    !cartEmpty && !customerNameError && !customerPhoneError && !finalizeOrder.isPending;

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
          // Clear the cart after a successful order creation
          clearAll();
        },
      },
    );
  }

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
                <Label htmlFor="customer-name">
                  Customer name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customer-name"
                  value={customer.name}
                  onChange={(e) => setCustomer({ name: e.target.value })}
                  placeholder="e.g. John Doe"
                  autoComplete="off"
                  aria-invalid={!!customerNameError}
                />
                {customerNameError && (
                  <p className="text-xs text-destructive">{customerNameError}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-phone">
                  Customer phone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customer-phone"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ phone: e.target.value })}
                  placeholder="e.g. 01712345678"
                  autoComplete="off"
                  aria-invalid={!!customerPhoneError}
                />
                {customerPhoneError && (
                  <p className="text-xs text-destructive">{customerPhoneError}</p>
                )}
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

          {/* Finalize order */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Finalize order</CardTitle>
              <CardDescription>
                Creates the order and moves it to the Pending list for status tracking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleFinalize} disabled={!canFinalize} className="w-full">
                {finalizeOrder.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating order…
                  </>
                ) : (
                  <>
                    Finalize order ({itemCount} items · {formatBDT(totals.total)})
                  </>
                )}
              </Button>
              {cartEmpty && (
                <p className="text-center text-xs text-muted-foreground">
                  Add at least one product to the cart.
                </p>
              )}
              {!cartEmpty && (customerNameError || customerPhoneError) && (
                <p className="text-center text-xs text-muted-foreground">
                  Fill in customer name and phone to finalize.
                </p>
              )}
              <p className="text-center text-xs text-muted-foreground">
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
