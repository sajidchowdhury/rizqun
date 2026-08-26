import { useState } from 'react';
import { Loader2, Package, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useProductSearch } from '@/hooks/use-products';
import type { ProductSearchResult } from '@/types/product';

interface ProductSearchProps {
  /** Controlled open state — used by the topbar cmd+K trigger. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when a product is selected. */
  onSelect?: (product: ProductSearchResult) => void;
  /** Trigger label for the button (when used inline). */
  triggerLabel?: string;
}

/**
 * Smart product search — debounced, full-text via backend tsvector.
 *
 * Two usage modes:
 *   1. Inline trigger button (default) — renders a Button that opens a
 *      shadcn CommandDialog.
 *   2. External trigger (cmd+K in topbar) — pass `open` + `onOpenChange`,
 *      render your own trigger, and ignore the button.
 */
export function ProductSearch({
  open,
  onOpenChange,
  onSelect,
  triggerLabel = 'Search products…',
}: ProductSearchProps) {
  const [query, setQuery] = useState('');

  // React Query handles the debounce via `enabled` (only fires when query
  // is >= 2 chars) + `staleTime: 10s` (don't re-search same query).
  const { data: results, isFetching } = useProductSearch(query, open);

  // Wrap onOpenChange so we clear the query when the dialog closes.
  // (Done in the callback rather than a useEffect to avoid the
  // setState-in-effect lint rule.)
  function handleOpenChange(next: boolean) {
    if (!next) setQuery('');
    onOpenChange(next);
  }

  function handleSelect(name: string) {
    const product = results?.data.find((p) => p.name === name);
    if (product) {
      onSelect?.(product);
      handleOpenChange(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="md:w-[280px] justify-start text-muted-foreground"
        onClick={() => handleOpenChange(true)}
        type="button"
      >
        <Search className="size-4" />
        {triggerLabel}
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <CommandInput placeholder="Type a product name…" value={query} onValueChange={setQuery} />
        <CommandList>
          {isFetching && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="ml-2 text-sm">Searching…</span>
            </div>
          )}
          {!isFetching && query.length > 0 && query.length < 2 && (
            <CommandEmpty>Keep typing…</CommandEmpty>
          )}
          {!isFetching && query.length >= 2 && (results?.data.length ?? 0) === 0 && (
            <CommandEmpty>No products found.</CommandEmpty>
          )}
          {!isFetching && (results?.data.length ?? 0) > 0 && (
            <CommandGroup heading="Products">
              {results?.data.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.name}
                  onSelect={handleSelect}
                  className="flex items-center gap-2"
                >
                  <Package className="size-4 text-muted-foreground" />
                  <div className="flex flex-1 items-center justify-between">
                    <div>
                      <span className="font-medium">{product.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {product.categoryName} · {product.vendorName}
                      </span>
                    </div>
                    <span className="font-mono text-sm">৳{Number(product.price).toFixed(2)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
