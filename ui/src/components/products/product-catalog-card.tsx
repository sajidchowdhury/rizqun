import { Minus, Plus, Check, Package } from 'lucide-react';

import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBDT } from '@/contexts/cart-store';

/**
 * Normalized card data — works whether the source is the list endpoint
 * (`GET /products`) or the search endpoint (`GET /products/search`).
 *
 * Both backend responses carry the same visual fields, just nested
 * differently; adapters in `product-catalog-card-adapters.ts` flatten
 * them into this shape.
 */
export interface CatalogCardData {
  id: number;
  name: string;
  price: string;
  unit: string;
  imageUrl: string | null;
  originalPrice: string | null;
  discountActive: boolean;
  genericName: string | null;
  categoryName: string;
  vendorName: string;
  /** Optional — used to show the "Essential" badge when available. */
  isEssential?: boolean;
}

interface ProductCatalogCardProps {
  product: CatalogCardData;
  /** Quantity currently in the cart for this product (0 = not in cart). */
  qtyInCart: number;
  /** Add one to the cart. */
  onAdd: () => void;
  /** Remove one from the cart (only called when qtyInCart > 0). */
  onDecrement: () => void;
  /** Set an exact qty (used by the inline number input). */
  onSetQty: (qty: number) => void;
}

/**
 * E-commerce-style product card used on the New Order page.
 *
 * Image-prominent (4:3 hero), name + vendor strip + price, and an inline
 * qty stepper that animates in once the product is in the cart. Designed
 * to be thumb-friendly on mobile and to make it obvious *what* the
 * operator is selling at a glance.
 */
export function ProductCatalogCard({
  product,
  qtyInCart,
  onAdd,
  onDecrement,
  onSetQty,
}: ProductCatalogCardProps) {
  const url = imageUrl(product.imageUrl);
  const hasDiscount = product.discountActive && product.originalPrice;
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.originalPrice)) * 100)
    : 0;
  const inCart = qtyInCart > 0;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        inCart && 'border-commerce/60 ring-1 ring-commerce/30',
      )}
    >
      {/* Hero image (4:3) */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {url ? (
          <img
            src={url}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
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
          <div className="flex size-full items-center justify-center">
            <Package className="size-8 text-muted-foreground/30" />
          </div>
        )}

        {/* Discount badge (top-left) */}
        {hasDiscount && discountPct > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            −{discountPct}%
          </span>
        )}

        {/* Essential badge (top-right, only when not in cart so they don't overlap) */}
        {product.isEssential && !inCart && (
          <span className="absolute right-2 top-2 rounded-md border border-commerce/40 bg-commerce-soft px-1.5 py-0.5 text-[10px] font-medium text-commerce-soft-foreground shadow-sm">
            Essential
          </span>
        )}

        {/* In-cart indicator (top-right) */}
        {inCart && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-commerce px-2 py-0.5 text-[11px] font-semibold text-commerce-foreground shadow-sm">
            <Check className="size-3" />
            {qtyInCart}
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
        <div className="text-xs text-muted-foreground">
          {product.categoryName} · {product.vendorName}
        </div>
        {product.genericName && (
          <div className="truncate text-[11px] text-muted-foreground/80">
            {product.genericName}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold tabular-nums">
              {formatBDT(Number(product.price))}
            </div>
            <div className="text-[11px] text-muted-foreground">
              / {product.unit}
              {hasDiscount && (
                <span className="ml-1 line-through">
                  {formatBDT(Number(product.originalPrice))}
                </span>
              )}
            </div>
          </div>

          {/* Qty stepper / Add button */}
          {inCart ? (
            <div className="flex items-center gap-1.5 rounded-full border border-commerce/40 bg-commerce-soft p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onDecrement}
                className="text-commerce-soft-foreground hover:bg-commerce/10 hover:text-commerce"
                aria-label={`Decrease ${product.name} quantity`}
              >
                <Minus className="size-3.5" />
              </Button>
              <input
                type="number"
                min={0}
                value={qtyInCart}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  onSetQty(Number.isFinite(n) ? Math.max(0, n) : 0);
                }}
                className="w-9 bg-transparent text-center font-mono text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label={`${product.name} quantity`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onAdd}
                className="text-commerce-soft-foreground hover:bg-commerce/10 hover:text-commerce"
                aria-label={`Increase ${product.name} quantity`}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onAdd}
              className="rounded-full bg-commerce text-commerce-foreground hover:bg-commerce/90"
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact badge for the "Essential" flag — exported for re-use on the products page. */
export function EssentialBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-commerce/40 bg-commerce-soft text-commerce-soft-foreground',
        className,
      )}
    >
      Essential
    </Badge>
  );
}
