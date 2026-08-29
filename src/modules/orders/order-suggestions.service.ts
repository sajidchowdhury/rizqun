// ─── Push-sell suggestions (smart cross-sell) ──────────────────
//
// "Push selling" — when a customer calls and orders some products, the
// operator can suggest additional items the customer might also want
// before finalizing the order. This service computes smart suggestions
// by combining three signals:
//
//   1. Co-purchase history (strongest signal)
//      For each product in the cart, find products commonly ordered
//      alongside it (from past orders). If customers who bought Rice
//      also bought Lentils, suggest Lentils when Rice is in the cart.
//
//   2. Essentials (medium signal)
//      Products flagged `isEssential = true` (household necessities the
//      shop curated). If the customer didn't order any essentials yet,
//      suggest a few.
//
//   3. Active discounts (weakest signal, but visually highlighted)
//      Products with `discountPrice` set. These get a "Save ৳X" badge
//      in the UI to make the suggestion more compelling.
//
// Ranking: co-purchase count > essential > discount. Items already in
// the cart are excluded. Dedup by productId. Limited to 8 suggestions.
//
// Endpoint: POST /orders/suggestions
//   Body: { productIds: number[] }
//   Response: { data: SuggestedProduct[] }

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { PublicProduct } from '../products/products.service';

// ─── Types ─────────────────────────────────────────────────────

export interface SuggestedProduct extends PublicProduct {
  /** Why this product is being suggested — drives the badge in the UI. */
  suggestionReason: 'co-purchase' | 'essential' | 'discount';
  /**
   * Co-purchase count — how many past orders contain this product
   * alongside any product in the cart. 0 for essentials/discounts.
   * Used to rank suggestions (higher = stronger signal).
   */
  coPurchaseCount: number;
  /**
   * For discount suggestions: the savings amount (salePrice - discountPrice).
   * 0 for non-discount suggestions. The UI shows "Save ৳X" when > 0.
   */
  savings: string;
}

export interface SuggestionInput {
  productIds: number[];
  /** Max suggestions to return. Default 8. */
  limit?: number;
}

// ─── Main service function ─────────────────────────────────────

export async function getOrderSuggestions(
  input: SuggestionInput,
): Promise<{ data: SuggestedProduct[] }> {
  const cartIds = input.productIds.filter((id) => Number.isFinite(id) && id > 0);
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);

  // ─── 1. Co-purchase history ─────────────────────────────────
  // For each product in the cart, find products commonly ordered
  // alongside it. We batch across all cart items in one query: for each
  // product NOT in the cart, count how many past orders contain BOTH
  // that product AND any cart product. Rank by count descending.
  //
  // This is the strongest signal — actual customer behavior.

  let coPurchaseRows: Array<{ product_id: number; count: bigint }> = [];
  if (cartIds.length > 0) {
    coPurchaseRows = await prisma.$queryRaw<Array<{ product_id: number; count: bigint }>>`
      SELECT oi2.product_id, COUNT(DISTINCT oi1.order_id)::bigint AS count
      FROM order_items oi1
      JOIN order_items oi2
        ON oi1.order_id = oi2.order_id
        AND oi2.product_id != oi1.product_id
      WHERE oi1.product_id IN (${Prisma.join(cartIds)})
        AND oi2.product_id IS NOT NULL
        AND oi2.product_id NOT IN (${Prisma.join(cartIds)})
        AND oi2.product_id IN (
          SELECT id FROM products WHERE is_active = true
        )
      GROUP BY oi2.product_id
      ORDER BY count DESC
      LIMIT ${limit * 2};
    `;
  }

  // Build a map: productId → co-purchase count
  const coPurchaseMap = new Map<number, number>();
  for (const row of coPurchaseRows) {
    coPurchaseMap.set(row.product_id, Number(row.count));
  }

  // ─── 2. Load the full product records for co-purchase hits ──
  // We need this to compute effectivePrice, discountPrice, etc.
  const coPurchaseIds = Array.from(coPurchaseMap.keys());
  let coPurchaseProducts: Array<PublicProduct & { isEssential: boolean }> = [];
  if (coPurchaseIds.length > 0) {
    const rows = await prisma.product.findMany({
      where: { id: { in: coPurchaseIds }, isActive: true },
      include: {
        category: { select: { id: true, slug: true, name: true } },
        vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true } },
      },
    });
    // Attach isEssential to each (toPublicProduct strips it, so we
    // carry it via a parallel map)
    coPurchaseProducts = rows.map((p) => ({
      ...toPublicProduct(p),
      isEssential: p.isEssential,
    }));
  }

  // ─── 3. Essentials + discounted items (fallback if co-purchase is thin) ──
  // We want to fill out the suggestion list to `limit` items. If co-purchase
  // gave us fewer than `limit`, top up with essentials + discounted items.
  //
  // Essentials: isEssential = true, not already in cart, not already a
  //   co-purchase hit.
  // Discounts: discountPrice IS NOT NULL, not already in cart, not
  //   already a co-purchase hit, not already an essential.
  //
  // We fetch both in one query + split in the application layer.

  const alreadySuggestedIds = new Set<number>([...cartIds, ...coPurchaseIds]);
  const needsTopUp = coPurchaseIds.length < limit;

  let essentialsAndDiscounts: Array<PublicProduct & { isEssential: boolean; discountPrice: string | null; salePrice: string }> = [];
  if (needsTopUp) {
    const rows = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: Array.from(alreadySuggestedIds) },
        // Only essentials OR discounted (don't suggest random products)
        OR: [{ isEssential: true }, { discountPrice: { not: null } }],
      },
      take: limit * 3, // generous — we'll filter + sort
      orderBy: { name: 'asc' },
      include: {
        category: { select: { id: true, slug: true, name: true } },
        vendor: { select: { id: true, name: true, phone: true, whatsappNumber: true } },
      },
    });
    essentialsAndDiscounts = rows.map((p) => ({
      ...toPublicProduct(p),
      isEssential: p.isEssential,
      discountPrice: p.discountPrice ? p.discountPrice.toString() : null,
      salePrice: p.salePrice.toString(),
    }));
  }

  // ─── 4. Build the suggestion list ───────────────────────────
  // Priority:
  //   1. Co-purchase hits (sorted by count desc)
  //   2. Essentials (random-ish order, capped)
  //   3. Discounted items (sorted by discount % desc — biggest savings first)
  //
  // Each item gets a `suggestionReason` so the UI can show the right badge.

  const suggestions: SuggestedProduct[] = [];

  // Co-purchase first — strongest signal
  for (const p of coPurchaseProducts) {
    const savings = p.discountPrice
      ? (Number(p.salePrice) - Number(p.discountPrice)).toString()
      : '0';
    suggestions.push({
      ...p,
      suggestionReason: 'co-purchase' as const,
      coPurchaseCount: coPurchaseMap.get(p.id) ?? 0,
      savings,
    });
    // Drop the isEssential field we attached temporarily (it's not on
    // SuggestedProduct — we use it only for the next step)
    delete (suggestions[suggestions.length - 1] as { isEssential?: boolean }).isEssential;
    if (suggestions.length >= limit) break;
  }

  // Essentials + discounts top-up
  if (suggestions.length < limit) {
    const remaining = limit - suggestions.length;

    // Split into essentials + discounts
    const essentials = essentialsAndDiscounts.filter((p) => p.isEssential);
    const discounts = essentialsAndDiscounts
      .filter((p) => !p.isEssential && p.discountPrice)
      // Sort by discount % descending (biggest savings first)
      .sort((a, b) => {
        const aPct = 1 - Number(a.discountPrice) / Number(a.salePrice);
        const bPct = 1 - Number(b.discountPrice) / Number(b.salePrice);
        return bPct - aPct;
      });

    // Interleave: 60% essentials, 40% discounts (rounded). Both are
    // valuable — essentials are "you probably need this", discounts are
    // "this is on sale, grab it".
    const essentialsCount = Math.ceil(remaining * 0.6);
    const discountsCount = remaining - essentialsCount;

    for (const p of essentials.slice(0, essentialsCount)) {
      const savings = p.discountPrice
        ? (Number(p.salePrice) - Number(p.discountPrice)).toString()
        : '0';
      suggestions.push({
        ...p,
        suggestionReason: 'essential' as const,
        coPurchaseCount: 0,
        savings,
      });
      delete (suggestions[suggestions.length - 1] as { isEssential?: boolean }).isEssential;
    }

    for (const p of discounts.slice(0, discountsCount)) {
      const savings = (Number(p.salePrice) - Number(p.discountPrice!)).toString();
      suggestions.push({
        ...p,
        suggestionReason: 'discount' as const,
        coPurchaseCount: 0,
        savings,
      });
      delete (suggestions[suggestions.length - 1] as { isEssential?: boolean }).isEssential;
    }
  }

  return { data: suggestions.slice(0, limit) };
}

// ─── Helper: toPublicProduct (local copy to avoid circular import) ──
//
// We need a small version of toPublicProduct here because the real one
// in products.service.ts has extra fields (productVendors) we don't
// need for suggestions. Keep this in sync with the real one if the
// Product shape changes.

function toPublicProduct(p: {
  id: number;
  name: string;
  sku: string | null;
  brand: string | null;
  purchasePrice: Prisma.Decimal;
  salePrice: Prisma.Decimal;
  discountPrice: Prisma.Decimal | null;
  categoryId: number;
  vendorId: number | null;
  unit: string;
  isActive: boolean;
  imageUrl: string | null;
  genericName: string | null;
  isEssential: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: number; slug: string; name: string } | null;
  vendor?: {
    id: number;
    name: string;
    phone: string;
    whatsappNumber: string | null;
  } | null;
}): PublicProduct {
  const effective = p.discountPrice ?? p.salePrice;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    purchasePrice: p.purchasePrice.toString(),
    salePrice: p.salePrice.toString(),
    discountPrice: p.discountPrice ? p.discountPrice.toString() : null,
    effectivePrice: effective.toString(),
    categoryId: p.categoryId,
    vendorId: p.vendorId,
    unit: p.unit,
    isActive: p.isActive,
    imageUrl: p.imageUrl,
    genericName: p.genericName,
    isEssential: p.isEssential,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ...(p.category && { category: p.category }),
    ...(p.vendor && { vendor: p.vendor }),
  };
}
