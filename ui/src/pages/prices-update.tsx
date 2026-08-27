import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Package, Save, Search, Store, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from '@/hooks/use-categories';
import { useVendors } from '@/hooks/use-vendors';
import {
  useVendorProducts,
  useBulkUpdatePrices,
  diffPriceEdits,
  type DraftPriceEdit,
} from '@/hooks/use-prices';
import { formatBDT } from '@/contexts/cart-store';
import type { VendorProduct } from '@/types/product';

// ─── Page ─────────────────────────────────────────────────────

export function PricesUpdatePage() {
  // ── Filter state ────────────────────────────────────────────
  const [vendorId, setVendorId] = useState<number | 'all'>('all');
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // ── Filter option data ──────────────────────────────────────
  const { data: vendorsResp } = useVendors({ limit: 100, isActive: true });
  const vendors = vendorsResp?.data ?? [];
  const { data: categories } = useCategories();

  // ── Vendor products ─────────────────────────────────────────
  const { data, isLoading } = useVendorProducts(vendorId, {
    categoryId: categoryId === 'all' ? undefined : categoryId,
    search: debouncedSearch || undefined,
    limit: 500,
  });
  // Memoize so the `changedItems` useMemo below doesn't re-diff on every
  // render (which the react-hooks/exhaustive-deps lint rule would flag).
  const products = useMemo(() => data?.data ?? [], [data]);

  // ── Draft edits: productId → { purchasePrice, salePrice, discountPrice } ──
  // The user types new values; we diff against the loaded `products`
  // at save time to figure out what actually changed.
  const [drafts, setDrafts] = useState<Map<number, DraftPriceEdit>>(new Map());

  // Reset drafts when vendor changes (done in the handler, not an effect,
  // so we don't trigger the react-hooks/set-state-in-effect lint rule).
  function handleVendorChange(next: number | 'all') {
    setVendorId(next);
    setDrafts(new Map());
    setCategoryId('all');
    setSearch('');
    setDebouncedSearch('');
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Bulk update mutation ────────────────────────────────────
  const bulkUpdate = useBulkUpdatePrices();

  // Compute the actual changes (diff drafts against current products)
  const changedItems = useMemo(
    () => diffPriceEdits(products, drafts),
    [products, drafts],
  );
  const changeCount = changedItems.length;

  function setDraft(productId: number, partial: Partial<DraftPriceEdit>) {
    setDrafts((prev) => {
      const next = new Map(prev);
      const existing = next.get(productId) ?? {
        purchasePrice: null,
        salePrice: null,
        discountPrice: null,
      };
      next.set(productId, { ...existing, ...partial });
      return next;
    });
  }

  function clearDraft(productId: number) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });
  }

  function handleSave() {
    if (vendorId === 'all' || changeCount === 0) return;
    bulkUpdate.mutate({
      vendorId: vendorId as number,
      note: `Morning price update — ${new Date().toISOString().slice(0, 10)}`,
      updates: changedItems,
    }, {
      onSuccess: () => {
        // Clear drafts after a successful save
        setDrafts(new Map());
      },
    });
  }

  function markAllUnchanged() {
    // "All prices unchanged today" — clear all drafts (no-op save)
    setDrafts(new Map());
  }

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-0">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Update Prices</h1>
          <p className="text-sm text-muted-foreground">
            Call the vendor in the morning, get today's prices, and update them here. Every change is logged.
          </p>
        </div>
        {vendorId !== 'all' && data?.vendor && (
          <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs">
            <Store className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Editing:</span>
            <span className="font-medium">{data.vendor.name}</span>
          </div>
        )}
      </header>

      {/* Top filter bar — vendor picker + category + search */}
      <Card>
        <CardContent className="gap-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Vendor picker — the primary control */}
            <Select
              value={String(vendorId)}
              onValueChange={(v) => handleVendorChange(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="h-11 w-full rounded-full px-4 text-sm shadow-sm sm:w-[260px]">
                <Store className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Pick a vendor…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Pick a vendor…</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-full pl-9 pr-9 text-sm shadow-sm"
                disabled={vendorId === 'all'}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Category filter */}
            <Select
              value={String(categoryId)}
              onValueChange={(v) => setCategoryId(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="h-11 w-full rounded-full px-4 text-sm shadow-sm sm:w-[180px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main content */}
      {vendorId === 'all' ? (
        <EmptyState
          icon={<Store className="size-12 text-muted-foreground/30" />}
          title="Pick a vendor to start"
          subtitle="Select a vendor above to load their products and edit prices."
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="size-12 text-muted-foreground/30" />}
          title="No products found for this vendor"
          subtitle="Try a different vendor, or clear the search / category filter."
        />
      ) : (
        <>
          {/* Quick-action row */}
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>
              Showing <span className="font-semibold text-foreground">{products.length}</span> products
            </span>
            <button
              type="button"
              onClick={markAllUnchanged}
              className="rounded-full px-2 py-1 transition-colors hover:bg-accent hover:text-foreground"
            >
              Mark all unchanged
            </button>
          </div>

          {/* Product list */}
          <div className="space-y-2">
            {products.map((p) => (
              <PriceEditCard
                key={p.id}
                product={p}
                draft={drafts.get(p.id)}
                onDraftChange={(partial) => setDraft(p.id, partial)}
                onClear={() => clearDraft(p.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Sticky bottom save bar (mobile + desktop) */}
      {vendorId !== 'all' && products.length > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto w-full max-w-2xl">
          <div className="flex items-center justify-between gap-3 rounded-full border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full font-semibold',
                  changeCount > 0
                    ? 'bg-commerce text-commerce-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {changeCount}
              </span>
              <span className="text-muted-foreground">
                {changeCount === 0
                  ? 'No changes yet'
                  : `${changeCount} product${changeCount === 1 ? '' : 's'} changed`}
              </span>
            </div>
            <Button
              onClick={handleSave}
              disabled={changeCount === 0 || bulkUpdate.isPending}
              className="rounded-full"
            >
              {bulkUpdate.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      {icon}
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// ─── Price edit card ───────────────────────────────────────────
//
// One card per product. Shows the image + name + current prices
// (read-only, small text) and 3 editable inputs for the new p.price,
// s.price, and discount. Each input shows a ↑/↓/same indicator
// comparing the new value to the current value.

interface PriceEditCardProps {
  product: VendorProduct;
  draft: DraftPriceEdit | undefined;
  onDraftChange: (partial: Partial<DraftPriceEdit>) => void;
  onClear: () => void;
}

function PriceEditCard({ product, draft, onDraftChange, onClear }: PriceEditCardProps) {
  const url = imageUrl(product.imageUrl);
  const hasEdits = draft !== undefined && (
    draft.purchasePrice !== null ||
    draft.salePrice !== null ||
    draft.discountPrice !== null
  );

  // Parse a typed input value to a number, or null if empty/invalid
  function parseInput(value: string): number | null {
    if (value.trim() === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // Compute the displayed input values:
  // - If draft is set, show the draft value
  // - Otherwise, show empty (the current value is shown as placeholder)
  const purchaseInput = draft?.purchasePrice !== null && draft?.purchasePrice !== undefined
    ? String(draft.purchasePrice)
    : '';
  const saleInput = draft?.salePrice !== null && draft?.salePrice !== undefined
    ? String(draft.salePrice)
    : '';
  const discountInput = draft?.discountPrice === 'clear'
    ? '' // 'clear' = empty (we're explicitly removing the discount)
    : draft?.discountPrice !== null && draft?.discountPrice !== undefined
      ? String(draft.discountPrice)
      : '';

  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-all',
        hasEdits && 'border-commerce/60 ring-1 ring-commerce/20',
      )}
    >
      <div className="flex gap-3 p-3">
        {/* Image */}
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {url ? (
            <img
              src={url}
              alt={product.name}
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Package className="size-6 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium" title={product.name}>
                {product.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{product.categoryName}</span>
                <span>·</span>
                <span>{product.unit}</span>
                {product.isDefaultVendor && (
                  <span className="rounded-full bg-commerce-soft px-1.5 py-0.5 text-[10px] font-medium text-commerce-soft-foreground">
                    Default vendor
                  </span>
                )}
              </div>
            </div>
            {hasEdits && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClear}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear edits for this product"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {/* 3 price inputs (responsive: 3 columns on desktop, stacked on mobile) */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <PriceInputCell
              label="Purchase price"
              hint="p.price (from vendor)"
              placeholder={product.vendorPurchasePrice}
              unit={product.unit}
              value={purchaseInput}
              onValueChange={(v) => onDraftChange({ purchasePrice: parseInput(v) })}
              indicator={draft?.purchasePrice ?? null}
              currentValue={Number(product.vendorPurchasePrice)}
            />
            <PriceInputCell
              label="Sale price"
              hint="s.price (to customer)"
              placeholder={product.salePrice}
              unit={product.unit}
              value={saleInput}
              onValueChange={(v) => onDraftChange({ salePrice: parseInput(v) })}
              indicator={draft?.salePrice ?? null}
              currentValue={Number(product.salePrice)}
            />
            <PriceInputCell
              label="Discount price"
              hint="optional — active customer price"
              placeholder={product.discountPrice ?? '—'}
              unit={product.unit}
              value={discountInput}
              onValueChange={(v) => onDraftChange({
                discountPrice: v.trim() === '' ? 'clear' : parseInput(v),
              })}
              indicator={
                draft?.discountPrice === 'clear'
                  ? 'clear'
                  : (draft?.discountPrice ?? null)
              }
              currentValue={product.discountPrice ? Number(product.discountPrice) : null}
              optional
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Price input cell ──────────────────────────────────────────
//
// A single labeled price input with:
// - The label (Purchase/Sale/Discount) + hint in small text
// - The input itself (with current value as placeholder)
// - A ↑/↓/same indicator next to the input comparing new vs current

interface PriceInputCellProps {
  label: string;
  hint: string;
  placeholder: string;
  unit: string;
  value: string;
  onValueChange: (value: string) => void;
  indicator: number | null | 'clear';
  currentValue: number | null;
  optional?: boolean;
}

function PriceInputCell({
  label,
  hint,
  placeholder,
  unit,
  value,
  onValueChange,
  indicator,
  currentValue,
  optional,
}: PriceInputCellProps) {
  // Compute the indicator state
  let indicatorEl: React.ReactNode = null;
  if (indicator === 'clear') {
    // Explicitly clearing the discount
    if (currentValue !== null) {
      indicatorEl = (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <X className="size-2.5" /> cleared
        </span>
      );
    }
  } else if (indicator !== null) {
    if (currentValue === null || currentValue === 0) {
      // New value being set (was 0/null)
      indicatorEl = (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-commerce-soft px-1.5 py-0.5 text-[10px] font-medium text-commerce-soft-foreground">
          <ArrowUp className="size-2.5" /> new
        </span>
      );
    } else if (indicator > currentValue) {
      indicatorEl = (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <ArrowUp className="size-2.5" />
          +{formatBDT(indicator - currentValue)}
        </span>
      );
    } else if (indicator < currentValue) {
      indicatorEl = (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <ArrowDown className="size-2.5" />
          −{formatBDT(currentValue - indicator)}
        </span>
      );
    } else {
      indicatorEl = (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Check className="size-2.5" /> same
        </span>
      );
    }
  }

  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium text-muted-foreground">
          {label}
          {optional && <span className="ml-1 text-muted-foreground/60">(opt.)</span>}
        </Label>
        {indicatorEl}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">৳</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder === '—' ? '' : placeholder}
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm font-mono tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          aria-label={`${label} for this product`}
        />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        {hint} · / {unit}
      </p>
    </div>
  );
}
