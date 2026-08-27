import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Phone, Search, User, UserPlus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { validateCustomer } from '@/lib/customer-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/hooks/use-cart';
import { useRecentCustomers } from '@/hooks/use-customer-search';
import type { RecentCustomer } from '@/types/customer';

/**
 * Customer info section for the New Order page.
 *
 * Combines a "find a repeat customer" search (de-dupes past orders by
 * phone, click-to-autofill) with an always-editable new-customer form.
 * Designed so the operator never has to choose between "search" and
 * "add new" — both flows live in the same surface and the form is
 * always one tap away.
 */
export function CustomerPicker() {
  const { customer, setCustomer } = useCart();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search past orders for repeat customers. The hook debounces via
  // the `enabled` gate + TanStack Query's staleTime.
  const trimmedQuery = query.trim();
  const { customers, isFetching } = useRecentCustomers(
    trimmedQuery,
    open && trimmedQuery.length >= 2,
  );

  const errors = useMemo(() => validateCustomer(customer), [customer]);

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function applyCustomer(c: RecentCustomer) {
    setCustomer({ name: c.name, phone: c.phone });
    // Address isn't returned by the orders list endpoint — leave the
    // existing value alone so the operator doesn't lose what they may
    // have already typed.
    setQuery('');
    setOpen(false);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setOpen(true);
  }

  function clearSearch() {
    setQuery('');
    setOpen(false);
  }

  const showDropdown =
    open && trimmedQuery.length >= 2 && (isFetching || customers.length > 0 || !isFetching);

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Repeat-customer search */}
      <div className="relative">
        <Label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Search className="size-3.5" />
          Find a repeat customer
          <span className="font-normal text-muted-foreground/70">(by name or phone)</span>
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="e.g. John or 01712345678"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => trimmedQuery.length >= 2 && setOpen(true)}
            className="h-10 rounded-lg pl-9 pr-9 text-sm"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Dropdown of repeat customers */}
        {showDropdown && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
            {isFetching && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching customers…
              </div>
            )}
            {!isFetching && customers.length === 0 && (
              <div className="px-3 py-4 text-sm">
                <p className="font-medium">No repeat customer found.</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Fill in the form below to add this as a new customer.
                </p>
              </div>
            )}
            {!isFetching &&
              customers.length > 0 &&
              customers.slice(0, 8).map((c) => (
                <button
                  key={c.phone}
                  type="button"
                  onClick={() => applyCustomer(c)}
                  className="flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent"
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-commerce-soft text-commerce-soft-foreground">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      <span className="font-mono">{c.phone}</span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Divider with "or new customer" label */}
      <div className="relative py-1 text-center">
        <span className="relative z-10 bg-card px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          or add a new customer
        </span>
        <div className="absolute inset-x-0 top-1/2 -z-0 h-px -translate-y-1/2 bg-border" />
      </div>

      {/* Editable customer form (always visible, always editable) */}
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="customer-name" className="text-xs font-medium">
            Customer name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="customer-name"
            value={customer.name}
            onChange={(e) => setCustomer({ name: e.target.value })}
            placeholder="e.g. John Doe"
            autoComplete="off"
            className={cn('h-10', errors.name && 'border-destructive focus-visible:ring-destructive/30')}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="customer-phone" className="text-xs font-medium">
            Customer phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="customer-phone"
            value={customer.phone}
            onChange={(e) => setCustomer({ phone: e.target.value })}
            placeholder="e.g. 01712345678"
            autoComplete="off"
            inputMode="tel"
            className={cn('h-10 font-mono', errors.phone && 'border-destructive focus-visible:ring-destructive/30')}
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="customer-address" className="text-xs font-medium">
            Customer address <span className="text-muted-foreground/70">(optional)</span>
          </Label>
          <Input
            id="customer-address"
            value={customer.address}
            onChange={(e) => setCustomer({ address: e.target.value })}
            placeholder="e.g. House 1, Road 2, Dhaka"
            autoComplete="off"
            className="h-10"
          />
        </div>
      </div>

      {/* Tiny quick-action: clear customer (only if anything is filled) */}
      {(customer.name || customer.phone || customer.address) && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setCustomer({ name: '', phone: '', address: '' })}
            className="text-muted-foreground hover:text-foreground"
          >
            <UserPlus className="size-3.5" />
            Reset customer
          </Button>
        </div>
      )}
    </div>
  );
}
