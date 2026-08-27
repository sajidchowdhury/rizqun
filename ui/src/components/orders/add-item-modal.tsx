import { useState } from 'react';
import { Loader2, Minus, Package, Plus, Search } from 'lucide-react';

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
import { Separator } from '@/components/ui/separator';
import { useProductSearch } from '@/hooks/use-products';
import { useAddOrderItem } from '@/hooks/use-orders';
import { formatBDT } from '@/contexts/cart-store';
import type { ProductSearchResult } from '@/types/product';

interface AddItemModalProps {
  orderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddItemModal({ orderId, open, onOpenChange }: AddItemModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [qty, setQty] = useState(1);

  const { data: results, isFetching } = useProductSearch(query, open);
  const addOrderItem = useAddOrderItem();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery('');
      setSelected(null);
      setQty(1);
    }
    onOpenChange(next);
  }

  const effectiveSelected = selected ?? results?.data?.[0] ?? null;

  function handleAdd() {
    if (!effectiveSelected) return;
    addOrderItem.mutate(
      { orderId, productId: effectiveSelected.id, qty },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5" />
            Add item to order
          </DialogTitle>
          <DialogDescription>
            Search the catalog and add an item. Items added here are marked as *NEW* for the vendor.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Type at least 2 characters to search…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="max-h-48 overflow-y-auto rounded-md border">
          {isFetching && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="ml-2 text-sm">Searching…</span>
            </div>
          )}
          {!isFetching && query.length >= 2 && (results?.data.length ?? 0) === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">No products found.</div>
          )}
          {!isFetching &&
            (results?.data.length ?? 0) > 0 &&
            results?.data.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  setSelected(product);
                  setQty(1);
                }}
                className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent ${
                  effectiveSelected?.id === product.id ? 'bg-accent' : ''
                }`}
              >
                <Package className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="truncate">
                    <span className="font-medium">{product.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {product.categoryName} · {product.vendorName}
                    </span>
                  </div>
                  <span className="ml-2 shrink-0 font-mono text-sm">
                    {formatBDT(Number(product.effectivePrice))}
                  </span>
                </div>
              </button>
            ))}
        </div>

        {effectiveSelected && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{effectiveSelected.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBDT(Number(effectiveSelected.effectivePrice))} / {effectiveSelected.unit}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                >
                  <Minus className="size-3" />
                </Button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="h-8 w-16 rounded-md border px-2 text-center text-sm font-mono"
                />
                <Button variant="outline" size="icon-sm" onClick={() => setQty((q) => q + 1)}>
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!effectiveSelected || addOrderItem.isPending}>
            {addOrderItem.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Adding…
              </>
            ) : (
              'Add to order'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
