import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackageX, Search, SlidersHorizontal, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useProductsInfinite } from '@/hooks/use-products';
import { useCart } from '@/hooks/use-cart';
import {
  ProductCatalogCard,
  type CatalogCardData,
} from '@/components/products/product-catalog-card';
import { productToCardData } from '@/components/products/product-catalog-card-adapters';
import type { Product } from '@/types/product';

interface OrderProductCatalogProps {
  /** Optional className to allow the parent to tweak outer spacing. */
  className?: string;
}

/**
 * Inline e-commerce storefront embedded on the New Order page.
 *
 * Replaces the old modal-based product picker with a fast, image-forward
 * grid the operator can browse, search, filter by category/vendor, and
 * tap-to-add — all without leaving the page. Designed mobile-first:
 * the filter chips scroll horizontally and the grid is 2 cols on phones.
 */
export function OrderProductCatalog({ className }: OrderProductCatalogProps) {
  // ── Filter state ──────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [vendorId, setVendorId] = useState<number | 'all'>('all');

  // ── Filter options (categories + active vendors) ────────────
  const { data: categories } = useCategories();
  const { data: vendorsResp } = useVendors({ limit: 100, isActive: true });
  const vendors = vendorsResp?.data ?? [];

  // ── Catalog data (infinite scroll) ─────────────────────────
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useProductsInfinite({
    search: debouncedSearch || undefined,
    categoryId: categoryId === 'all' ? undefined : categoryId,
    vendorId: vendorId === 'all' ? undefined : vendorId,
    isActive: true, // Hide inactive products from the order UI
    pageSize: 24,
  });

  // Flatten the infinite-query pages into a single list of products.
  // The cart handlers below look up the matching Product by id from
  // this array (the card itself only sees the flattened CatalogCardData).
  const products = useMemo(() => {
    const flat: Product[] = [];
    for (const page of data?.pages ?? []) {
      for (const p of page.data) flat.push(p);
    }
    return flat;
  }, [data]);

  // ── Cart integration ────────────────────────────────────────
  const { items, addItem, incrementQty, decrementQty, setQty } = useCart();

  const qtyByProductId = useMemo(() => {
    const m = new Map<number, number>();
    for (const item of items) m.set(item.productId, item.qty);
    return m;
  }, [items]);

  function handleAdd(product: Product) {
    const existing = items.find((i) => i.productId === product.id);
    if (existing) {
      incrementQty(product.id);
      return;
    }
    // New line — addItem needs the full denormalized shape.
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      vendorId: product.vendorId,
      vendorName: product.vendor?.name ?? '—',
      categoryId: product.categoryId,
      categorySlug: product.category?.slug ?? 'other',
      categoryName: product.category?.name ?? '—',
      unit: product.unit,
      imageUrl: product.imageUrl,
    });
  }

  function handleDecrement(productId: number) {
    decrementQty(productId);
  }

  function handleSetQty(productId: number, qty: number) {
    setQty(productId, qty);
  }

  // ── Debounce search (300ms) ─────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Filter chips (All + each category) ───────────────────────
  const hasActiveFilters =
    debouncedSearch !== '' || categoryId !== 'all' || vendorId !== 'all';

  function clearFilters() {
    setSearch('');
    setCategoryId('all');
    setVendorId('all');
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {/* Search + vendor dropdown row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products by name, brand, generic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-full pl-9 pr-9 text-sm shadow-sm"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(vendorId)}
            onValueChange={(v) => setVendorId(v === 'all' ? 'all' : Number(v))}
          >
            <SelectTrigger className="h-11 w-full rounded-full bg-background px-4 text-sm shadow-sm sm:w-[180px]">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Category chip strip — horizontally scrollable on mobile */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
        <CategoryChip
          active={categoryId === 'all'}
          onClick={() => setCategoryId('all')}
        >
          All
        </CategoryChip>
        {categories?.map((cat) => (
          <CategoryChip
            key={cat.id}
            active={categoryId === cat.id}
            onClick={() => setCategoryId(cat.id)}
          >
            {cat.name}
          </CategoryChip>
        ))}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </div>

      {/* Active filter summary (only on desktop, hidden on mobile because
          the chip strip + clear button already communicate this) */}
      {hasActiveFilters && (
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span>Showing</span>
          {categoryId !== 'all' && (
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              {categories?.find((c) => c.id === categoryId)?.name ?? 'Category'}
            </span>
          )}
          {vendorId !== 'all' && (
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              {vendors.find((v) => v.id === vendorId)?.name ?? 'Vendor'}
            </span>
          )}
          {debouncedSearch && (
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              “{debouncedSearch}”
            </span>
          )}
        </div>
      )}

      {/* Grid (or loading / empty state) */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border">
              <Skeleton className="aspect-[4/3] w-full" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="mt-2 h-7 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <PackageX className="size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No products match your filters</p>
          <p className="text-xs text-muted-foreground">
            Try a different search term, or clear the filters.
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => {
              const card: CatalogCardData = productToCardData(p);
              return (
                <ProductCatalogCard
                  key={p.id}
                  product={card}
                  qtyInCart={qtyByProductId.get(p.id) ?? 0}
                  onAdd={() => handleAdd(p)}
                  onDecrement={() => handleDecrement(p.id)}
                  onSetQty={(q) => handleSetQty(p.id, q)}
                />
              );
            })}
          </div>

          {/* Load more (infinite scroll, but with an explicit button
              so the operator stays in control — important on phones
              where the keyboard might be open) */}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded-full"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Category chip ──────────────────────────────────────────────

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
