import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackageX, Pencil, Plus, Search, SlidersHorizontal, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateProduct,
  useProductsInfinite,
  useToggleProduct,
  useUpdateProduct,
} from '@/hooks/use-products';
import { useCategories } from '@/hooks/use-categories';
import { useVendors } from '@/hooks/use-vendors';
import { useAuth } from '@/hooks/use-auth';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import type { Product } from '@/types/product';
import type { CreateProductForm } from '@/schemas/product';
import { formatBDT } from '@/contexts/cart-store';

// ─── Sort options ──────────────────────────────────────────────
type SortKey = 'newest' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  'name-asc': 'Name A → Z',
  'name-desc': 'Name Z → A',
  'price-asc': 'Price ↑',
  'price-desc': 'Price ↓',
};

// ─── Page ───────────────────────────────────────────────────────

export function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  // ── Filter state ────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [vendorId, setVendorId] = useState<number | 'all'>('all');
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [sort, setSort] = useState<SortKey>('newest');

  // Debounce search (300ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Filter option data ─────────────────────────────────────
  const { data: categories } = useCategories();
  const { data: vendorsResp } = useVendors({ limit: 100 });
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
    isActive: isActive === 'all' ? undefined : isActive === 'true',
    pageSize: 24,
  });

  // Flatten pages and apply client-side sort (the backend doesn't
  // expose a `sort` param — we sort the loaded pages client-side,
  // which is fine for a few hundred rows).
  const products = useMemo(() => {
    const flat: Product[] = [];
    for (const page of data?.pages ?? []) flat.push(...page.data);
    sortProducts(flat, sort);
    return flat;
  }, [data, sort]);

  const totalCount = data?.pages[0]?.pagination.total ?? 0;

  // ── Mutations ──────────────────────────────────────────────
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const toggleProduct = useToggleProduct();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  function handleCreate(values: CreateProductForm) {
    createProduct.mutate(values, { onSuccess: () => setCreateOpen(false) });
  }
  function handleUpdate(values: CreateProductForm) {
    if (!editTarget) return;
    updateProduct.mutate(
      { id: editTarget.id, ...values },
      { onSuccess: () => setEditTarget(null) },
    );
  }

  // ── Filter helpers ─────────────────────────────────────────
  const hasActiveFilters =
    debouncedSearch !== '' ||
    categoryId !== 'all' ||
    vendorId !== 'all' ||
    isActive !== 'all' ||
    sort !== 'newest';

  function clearFilters() {
    setSearch('');
    setCategoryId('all');
    setVendorId('all');
    setIsActive('all');
    setSort('newest');
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Browse the catalog. Admins can create, edit, and toggle products.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="rounded-full">
            <Plus className="size-4" />
            New product
          </Button>
        )}
      </header>

      {/* Filter bar */}
      <Card className="overflow-hidden">
        <CardContent className="gap-3 p-4">
          {/* Top row: search + sort (always visible) */}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-11 w-full rounded-full bg-background px-4 text-sm shadow-sm sm:w-[170px]">
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SORT_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bottom row: category + vendor + active status (wrap on mobile) */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(categoryId)}
              onValueChange={(v) => setCategoryId(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="h-9 w-[150px] rounded-full text-xs">
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

            <Select
              value={String(vendorId)}
              onValueChange={(v) => setVendorId(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="h-9 w-[150px] rounded-full text-xs">
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

            <Select
              value={isActive}
              onValueChange={(v) => setIsActive(v as 'all' | 'true' | 'false')}
            >
              <SelectTrigger className="h-9 w-[120px] rounded-full text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="ml-auto h-9 rounded-full text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result count */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {isLoading
            ? 'Loading…'
            : `${totalCount} product${totalCount === 1 ? '' : 's'}${
                hasActiveFilters ? ' · filtered' : ''
              }`}
        </span>
      </div>

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
            {products.map((p) => (
              <ProductBrowseCard
                key={p.id}
                product={p}
                isAdmin={isAdmin}
                onEdit={() => setEditTarget(p)}
                onToggle={(checked) =>
                  toggleProduct.mutate({ id: p.id, isActive: checked })
                }
                toggling={toggleProduct.isPending}
              />
            ))}
          </div>

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

      {/* Create dialog (admin only) */}
      {isAdmin && (
        <ProductFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={handleCreate}
          submitting={createProduct.isPending}
        />
      )}

      {/* Edit dialog (admin only) */}
      {isAdmin && (
        <ProductFormDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          product={editTarget}
          onSubmit={handleUpdate}
          submitting={updateProduct.isPending}
        />
      )}
    </div>
  );
}

// ─── Browse card ────────────────────────────────────────────────
//
// Image-prominent card used in the Products grid. Shares the visual
// language with the New Order card (4:3 hero, name + price + meta)
// but swaps the cart stepper for admin actions (toggle + edit).

interface ProductBrowseCardProps {
  product: Product;
  isAdmin: boolean;
  onEdit: () => void;
  onToggle: (checked: boolean) => void;
  toggling: boolean;
}

function ProductBrowseCard({
  product,
  isAdmin,
  onEdit,
  onToggle,
  toggling,
}: ProductBrowseCardProps) {
  // Phase 1 (2026-08-28): the new 3-price model. `discountPrice` (if set)
  // IS the active customer price; the strikethrough shows the original
  // salePrice for comparison (e-commerce style).
  const url = imageUrl(product.imageUrl);
  const hasDiscount = !!product.discountPrice;
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.discountPrice) / Number(product.salePrice)) * 100)
    : 0;
  const inactive = !product.isActive;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        inactive && 'opacity-70',
      )}
    >
      {/* Hero image (4:3). The img is absolutely positioned so it can't push
          the wrapper's height — the wrapper's `aspect-ratio` is the only thing
          that determines its size. Without this, Tailwind v4's preflight
          `img { height: auto }` + flex column would let the image's intrinsic
          height drive the card. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {url ? (
          <img
            src={url}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.dataset.fallback) {
                parent.dataset.fallback = '1';
                parent.classList.add('flex', 'items-center', 'justify-center');
                const icon = document.createElement('span');
                icon.innerHTML =
                  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/40"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><path d="M3.27 6.96 12 12.01l8.73-5.05"></path><path d="M12 22.08V12"></path></svg>';
                parent.appendChild(icon);
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted-foreground/5">
            <PackageX className="size-8 text-muted-foreground/30" />
          </div>
        )}

        {hasDiscount && discountPct > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            −{discountPct}%
          </span>
        )}
        {product.isEssential && (
          <span className="absolute right-2 top-2 rounded-md border border-commerce/40 bg-commerce-soft px-1.5 py-0.5 text-[10px] font-medium text-commerce-soft-foreground shadow-sm">
            Essential
          </span>
        )}
        {!product.isActive && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inactive
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3
          className="line-clamp-2 text-sm font-medium leading-snug"
          title={product.name}
        >
          {product.name}
        </h3>
        {product.brand && (
          <div className="truncate text-[11px] text-muted-foreground">
            Brand: <span className="font-medium text-foreground/80">{product.brand}</span>
          </div>
        )}
        {product.genericName && (
          <div className="truncate text-[11px] text-muted-foreground/80">
            {product.genericName}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatBDT(Number(product.effectivePrice))}
              </span>
              {hasDiscount && (
                <span className="font-mono text-[11px] text-muted-foreground line-through">
                  {formatBDT(Number(product.salePrice))}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              / {product.unit}
              {hasDiscount && (
                <span className="ml-1.5 rounded-full bg-commerce-soft px-1.5 py-0.5 text-[10px] font-medium text-commerce-soft-foreground">
                  Save {formatBDT(Number(product.salePrice) - Number(product.discountPrice))}
                </span>
              )}
            </div>
          </div>
          {product.category && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {product.category.name}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
          <span className="truncate">
            {product.vendor?.name ?? '—'}
          </span>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={product.isActive}
                disabled={toggling}
                onCheckedChange={onToggle}
                aria-label={`Toggle active for ${product.name}`}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onEdit}
                aria-label={`Edit ${product.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          ) : product.isActive ? (
            <Badge className="h-5 text-[10px]">Active</Badge>
          ) : (
            <Badge variant="secondary" className="h-5 text-[10px]">
              Inactive
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sort helper (client-side, applied to the loaded pages) ────

function sortProducts(list: Product[], sort: SortKey): void {
  switch (sort) {
    case 'name-asc':
      list.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      list.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'price-asc':
      // Phase 1: sort by effectivePrice (what the customer actually pays)
      list.sort((a, b) => Number(a.effectivePrice) - Number(b.effectivePrice));
      break;
    case 'price-desc':
      list.sort((a, b) => Number(b.effectivePrice) - Number(a.effectivePrice));
      break;
    case 'newest':
    default:
      // Backend already returns newest first; keep stable.
      list.sort((a, b) => b.id - a.id);
      break;
  }
}
