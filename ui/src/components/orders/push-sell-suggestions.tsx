import { useMemo } from 'react';
import { Loader2, Package, Sparkles, Tag, TrendingUp, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/use-cart';
import { useOrderSuggestions } from '@/hooks/use-orders';
import { formatBDT } from '@/contexts/cart-store';
import type { SuggestedProduct, SuggestionReason } from '@/types/product';

// ─── Component ────────────────────────────────────────────────
//
// Smart push-sell suggestions. Shown in the cart offcanvas above the
// Finalize button so the operator can offer them to the customer
// before the call wraps up ("would you also like X? It's on sale!").
//
// The hook auto-fetches suggestions based on the current cart's
// productIds. Each suggestion has a reason (co-purchase / essential /
// discount) which drives the badge. Items already in the cart are
// excluded by the backend, so the operator doesn't see duplicates.
//
// Compact horizontal layout — image + name + price + reason badge +
// Add button — so 4-5 suggestions fit in the offcanvas without
// dominating the screen.

interface PushSellSuggestionsProps {
  /** Hide the component entirely (e.g. when cart is empty). */
  hidden?: boolean;
}

export function PushSellSuggestions({ hidden }: PushSellSuggestionsProps) {
  const { items, addItem, incrementQty } = useCart();

  // Build the list of cart productIds for the suggestions query
  const cartProductIds = useMemo(
    () => items.map((i) => i.productId),
    [items],
  );

  // Map for "is this already in the cart?" check (in case the backend
  // suggestion list hasn't refreshed yet after a quick add)
  const inCartMap = useMemo(
    () => new Set(items.map((i) => i.productId)),
    [items],
  );

  const { data, isFetching } = useOrderSuggestions(
    cartProductIds,
    !hidden && cartProductIds.length > 0,
  );

  if (hidden || cartProductIds.length === 0) return null;

  const suggestions = data?.data ?? [];

  // Don't render anything if we have no suggestions AND we're not
  // fetching (so an empty state doesn't take up space)
  if (!isFetching && suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5 text-commerce" />
        <span>You might also want</span>
        {isFetching && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-1.5">
        {suggestions.map((p) => (
          <SuggestionRow
            key={p.id}
            product={p}
            inCart={inCartMap.has(p.id)}
            onAdd={() => handleAdd(p, items, addItem, incrementQty)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Add handler ───────────────────────────────────────────────
//
// Mirrors the OrderProductCatalog's handleAdd: if the product is already
// in the cart (edge case where the suggestion list hasn't refreshed),
// increment the qty instead of adding a new line.

function handleAdd(
  product: SuggestedProduct,
  items: Array<{ productId: number }>,
  addItem: (item: {
    productId: number;
    name: string;
    price: string;
    vendorId: number;
    vendorName: string;
    categoryId: number;
    categorySlug: string;
    categoryName: string;
    unit: string;
    imageUrl?: string | null;
    qty?: number;
  }) => void,
  incrementQty: (productId: number) => void,
) {
  const existing = items.find((i) => i.productId === product.id);
  if (existing) {
    incrementQty(product.id);
    return;
  }
  addItem({
    productId: product.id,
    name: product.name,
    price: product.effectivePrice,
    vendorId: product.vendorId ?? 0,
    vendorName: product.vendor?.name ?? '—',
    categoryId: product.categoryId,
    categorySlug: product.category?.slug ?? 'other',
    categoryName: product.category?.name ?? '—',
    unit: product.unit,
    imageUrl: product.imageUrl,
  });
}

// ─── Suggestion row ───────────────────────────────────────────

interface SuggestionRowProps {
  product: SuggestedProduct;
  inCart: boolean;
  onAdd: () => void;
}

function SuggestionRow({ product, inCart, onAdd }: SuggestionRowProps) {
  const url = imageUrl(product.imageUrl);
  const hasDiscount = !!product.discountPrice;
  const savings = Number(product.savings);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card p-2 transition-colors',
        inCart && 'opacity-60',
      )}
    >
      {/* Thumbnail — small square (not 4:3, to keep the row compact) */}
      <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {url ? (
          <img
            src={url}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="size-4 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Name + meta + reason badge */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium" title={product.name}>
            {product.name}
          </span>
          <ReasonBadge reason={product.suggestionReason} count={product.coPurchaseCount} />
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="font-mono text-xs font-semibold tabular-nums">
            {formatBDT(Number(product.effectivePrice))}
          </span>
          {hasDiscount && (
            <span className="font-mono text-[10px] text-muted-foreground line-through">
              {formatBDT(Number(product.salePrice))}
            </span>
          )}
          {savings > 0 && (
            <span className="rounded-full bg-commerce-soft px-1.5 py-0.5 text-[10px] font-medium text-commerce-soft-foreground">
              Save {formatBDT(savings)}
            </span>
          )}
        </div>
      </div>

      {/* Add button */}
      <Button
        type="button"
        size="xs"
        onClick={onAdd}
        disabled={inCart}
        className="shrink-0 rounded-full bg-commerce text-commerce-foreground hover:bg-commerce/90"
      >
        {inCart ? 'Added' : 'Add'}
      </Button>
    </div>
  );
}

// ─── Reason badge ──────────────────────────────────────────────
//
// Small pill that explains why this product is being suggested. Different
// color + icon per reason so the operator can scan quickly.

function ReasonBadge({
  reason,
  count,
}: {
  reason: SuggestionReason;
  count: number;
}) {
  if (reason === 'co-purchase' && count > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        title={`Bought together ${count} time${count === 1 ? '' : 's'} in past orders`}
      >
        <TrendingUp className="size-2.5" />
        ×{count}
      </span>
    );
  }
  if (reason === 'essential') {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full bg-commerce-soft px-1.5 py-0.5 text-[9px] font-medium text-commerce-soft-foreground"
        title="Household essential"
      >
        <Users className="size-2.5" />
        Essential
      </span>
    );
  }
  if (reason === 'discount') {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
        title="On sale"
      >
        <Tag className="size-2.5" />
        Sale
      </span>
    );
  }
  return null;
}
