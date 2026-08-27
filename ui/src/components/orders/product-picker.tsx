import { useState } from 'react';
import { Loader2, Minus, Plus, Search, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ProductImage } from '@/components/products/product-image';
import { useProductSearch } from '@/hooks/use-products';
import { useCart } from '@/hooks/use-cart';
import { formatBDT } from '@/contexts/cart-store';
import type { ProductSearchResult, Product } from '@/types/product';
import { QuickAddProduct } from './quick-add-product';

interface ProductPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductPicker({ open, onOpenChange }: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [qty, setQty] = useState(1);
  const [recentlyAdded, setRecentlyAdded] = useState<
    Array<{ name: string; qty: number; price: string }>
  >([]);
  // When the user clicks "Quick-add" after a 0-results search, we
  // expand the inline QuickAddProduct form. The search query is passed
  // as the default name to save re-typing.
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const { data: results, isFetching } = useProductSearch(query, open);
  const { addItem } = useCart();

  // Reset transient state when the dialog closes (done in onOpenChange
  // callback to avoid setState-in-effect lint rule).
  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery('');
      setSelected(null);
      setQty(1);
      setQuickAddOpen(false);
    }
    onOpenChange(next);
  }

  // When the user types, clear the current selection (the previously
  // selected product no longer matches the new search). Also collapse
  // the quick-add form if it was open (the user is searching again).
  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setQuickAddOpen(false);
  }

  // If we have results but no selection yet, derive the "would-be" selected
  // product. We render the qty stepper + totals using this derived value
  // so the operator gets a default to confirm with Enter. We do NOT call
  // setSelected here (that would be setState-in-render). Instead we use
  // the derived value directly in the UI.
  const effectiveSelected = selected ?? results?.data?.[0] ?? null;

  function selectProduct(product: ProductSearchResult) {
    setSelected(product);
    setQty(1);
  }

  function handleAddToCart(closeAfter: boolean) {
    if (!effectiveSelected) return;
    const product = effectiveSelected;
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
      categoryId: product.categoryId,
      categorySlug: product.categorySlug,
      categoryName: product.categoryName,
      unit: product.unit,
      qty,
    });
    setRecentlyAdded((prev) => [
      { name: product.name, qty, price: product.price },
      ...prev.slice(0, 4),
    ]);
    if (closeAfter) {
      handleOpenChange(false);
    } else {
      // Reset for the next add — keep the dialog open
      setSelected(null);
      setQty(1);
      setQuery('');
    }
  }

  function handleQuickAddSuccess(product: Product) {
    // Add to recently-added chips with qty=1 (the QuickAddProduct form
    // already added to cart).
    setRecentlyAdded((prev) => [
      { name: product.name, qty: 1, price: product.price },
      ...prev.slice(0, 4),
    ]);
    // Close the picker — the operator can re-open it to search for the
    // product they just created (it's now in the catalog).
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add product to cart</DialogTitle>
          <DialogDescription>
            Search the catalog. Select a product, set the quantity, then add to cart. If the product
            isn't in the catalog, quick-add it.
          </DialogDescription>
        </DialogHeader>

        {/* Search input — inline (not via CommandDialog) because we want
            the results visible alongside the qty stepper + add button. */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Type at least 2 characters to search…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>

        {/* Results list */}
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {query.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">Keep typing…</div>
          )}
          {isFetching && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="ml-2 text-sm">Searching…</span>
            </div>
          )}
          {!isFetching && query.length >= 2 && (results?.data.length ?? 0) === 0 && (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">No products found.</p>
              {!quickAddOpen && (
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2 h-auto"
                  onClick={() => setQuickAddOpen(true)}
                >
                  <Sparkles className="size-3.5" />
                  Not in catalog? Quick-add it
                </Button>
              )}
            </div>
          )}
          {!isFetching &&
            (results?.data.length ?? 0) > 0 &&
            results?.data.map((product) => {
              const isSelected = effectiveSelected?.id === product.id;
              const hasDiscount = product.discountActive && product.originalPrice;
              const discountPct = hasDiscount
                ? Math.round((1 - Number(product.price) / Number(product.originalPrice)) * 100)
                : 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => selectProduct(product)}
                  className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                >
                  <ProductImage src={product.imageUrl} alt={product.name} size="xs" />
                  <div className="flex flex-1 items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{product.name}</span>
                        {hasDiscount && discountPct > 0 && (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            −{discountPct}%
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {product.categoryName} · {product.vendorName} · {product.unit}
                      </div>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <span className="font-mono text-sm">{formatBDT(Number(product.price))}</span>
                      {hasDiscount && (
                        <span className="ml-1 text-xs text-muted-foreground line-through">
                          {formatBDT(Number(product.originalPrice))}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>

        {/* Quick-add form (shown when the user clicks "Quick-add it") */}
        {quickAddOpen && (
          <>
            <Separator />
            <div className="rounded-md border border-dashed bg-muted/30 p-3">
              <p className="mb-3 text-sm font-medium">Quick-add a custom product</p>
              <QuickAddProduct
                defaultName={query}
                onSuccess={handleQuickAddSuccess}
                onCancel={() => setQuickAddOpen(false)}
              />
            </div>
          </>
        )}

        {/* Selected product + qty stepper (hidden when quick-add form is open) */}
        {!quickAddOpen && effectiveSelected && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{effectiveSelected.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {effectiveSelected.categoryName} · {effectiveSelected.vendorName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">
                    {formatBDT(Number(effectiveSelected.price))} / {effectiveSelected.unit}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    Subtotal: {formatBDT(Number(effectiveSelected.price) * qty)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Quantity</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="size-4" />
                  </Button>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="h-8 w-16 rounded-md border px-2 text-center text-sm font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setQty((q) => q + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Recently added chips (hidden when quick-add form is open) */}
        {!quickAddOpen && recentlyAdded.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Recently added</p>
              <div className="flex flex-wrap gap-1.5">
                {recentlyAdded.map((item, i) => (
                  <Badge key={`${item.name}-${i}`} variant="secondary" className="text-xs">
                    {item.name} ×{item.qty} ({formatBDT(Number(item.price) * item.qty)})
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer buttons (hidden when quick-add form is open — the
            form has its own Create & add to cart button) */}
        {!quickAddOpen && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleAddToCart(false)}
              disabled={!effectiveSelected}
            >
              Add another
            </Button>
            <Button onClick={() => handleAddToCart(true)} disabled={!effectiveSelected}>
              Add to cart
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
