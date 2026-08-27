// ─── Vendor selection service ──────────────────────────────────
//
// Phase 4 (2026-08-28): vendor profitability auto-selection.
//
// When an order has items that can come from multiple vendors, this
// service picks the most profitable vendor per item by computing
// `effectivePrice - vendor.purchasePrice` per candidate vendor.
//
// Selection priority (highest to lowest):
//   1. "preferred"     — a ProductVendor marked isPreferred = true
//                        (operator's deliberate override — always wins)
//   2. "auto"          — among candidate vendors, the one with the
//                        highest margin (effectivePrice - purchasePrice)
//   3. "only-vendor"   — product has exactly one candidate vendor
//   4. "default-vendor"— product has no ProductVendor rows; fall back
//                        to Product.vendorId
//
// The chosen vendor + purchasePrice + reason are snapshot into the
// OrderItem at finalize time so the margin can be computed retroactively
// (even after prices change later).

import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';

// ─── Types ─────────────────────────────────────────────────────

export type VendorChoiceReason = 'auto' | 'manual' | 'only-vendor' | 'default-vendor' | 'preferred';

export interface VendorCandidate {
  vendorId: number;
  vendorName: string;
  purchasePrice: Prisma.Decimal;
  /** Margin = effectivePrice - purchasePrice (per unit). */
  margin: Prisma.Decimal;
  isPreferred: boolean;
}

export interface VendorSelectionResult {
  /** The chosen vendor's ID. */
  vendorId: number;
  /** The purchase price from the chosen vendor (snapshot value). */
  purchasePrice: Prisma.Decimal;
  /** Why this vendor was chosen. */
  reason: VendorChoiceReason;
  /** All candidate vendors for this product (including the chosen one),
   *  with their margins — used by the UI to show alternatives + allow
   *  manual override. */
  candidates: VendorCandidate[];
}

// ─── Core selection function ──────────────────────────────────
//
// Given a productId + the effectivePrice (what the customer pays),
// returns the chosen vendor + all candidates.
//
// `prismaClient` is injectable so this can run inside a transaction
// (pass `tx` from `prisma.$transaction(async (tx) => ...)`).

export async function selectVendorForProduct(
  productId: number,
  effectivePrice: Prisma.Decimal,
  prismaClient: PrismaClient = prisma,
): Promise<VendorSelectionResult> {
  // Load the product (need vendorId for the fallback + to confirm it exists)
  const product = await prismaClient.product.findUnique({
    where: { id: productId },
    select: { id: true, vendorId: true },
  });
  if (!product) {
    throw new AppError(404, `Product ${productId} not found`);
  }

  // Load all ProductVendor rows for this product, joining the Vendor to
  // get the name + isActive flag. We only consider ACTIVE vendors.
  const productVendors = await prismaClient.productVendor.findMany({
    where: { productId, vendor: { isActive: true } },
    include: {
      vendor: {
        select: { id: true, name: true, isActive: true },
      },
    },
  });

  // Build the candidate list with computed margins
  const candidates: VendorCandidate[] = productVendors.map((pv) => ({
    vendorId: pv.vendorId,
    vendorName: pv.vendor.name,
    purchasePrice: pv.purchasePrice,
    margin: effectivePrice.minus(pv.purchasePrice),
    isPreferred: pv.isPreferred,
  }));

  // ─── Selection logic ────────────────────────────────────────

  // Case 1: No ProductVendor rows → fall back to Product.vendorId
  if (candidates.length === 0) {
    if (!product.vendorId) {
      // No vendor at all — shouldn't happen (schema allows null but
      // finalize validates vendor isActive). Return vendorId 0 with
      // zero purchase price so the caller can decide what to do.
      return {
        vendorId: 0,
        purchasePrice: new Prisma.Decimal(0),
        reason: 'default-vendor',
        candidates: [],
      };
    }

    // Load the default vendor's name + current Product.purchasePrice
    // (the product-level purchasePrice, NOT a per-vendor one, since
    // no ProductVendor row exists).
    const defaultVendor = await prismaClient.vendor.findUnique({
      where: { id: product.vendorId },
      select: { id: true, name: true, isActive: true },
    });

    // Load the product-level purchasePrice for the snapshot
    const productWithPrice = await prismaClient.product.findUnique({
      where: { id: productId },
      select: { purchasePrice: true },
    });
    const purchasePrice = productWithPrice?.purchasePrice ?? new Prisma.Decimal(0);

    return {
      vendorId: product.vendorId,
      purchasePrice,
      reason: 'default-vendor',
      candidates: defaultVendor
        ? [
            {
              vendorId: defaultVendor.id,
              vendorName: defaultVendor.name,
              purchasePrice,
              margin: effectivePrice.minus(purchasePrice),
              isPreferred: false,
            },
          ]
        : [],
    };
  }

  // Case 2: Exactly one candidate → "only-vendor"
  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      vendorId: c.vendorId,
      purchasePrice: c.purchasePrice,
      reason: 'only-vendor',
      candidates,
    };
  }

  // Case 3: A candidate is marked isPreferred → "preferred" (always wins)
  const preferred = candidates.find((c) => c.isPreferred);
  if (preferred) {
    return {
      vendorId: preferred.vendorId,
      purchasePrice: preferred.purchasePrice,
      reason: 'preferred',
      candidates,
    };
  }

  // Case 4: Multiple candidates, no preferred → "auto" (highest margin wins)
  // Sort by margin descending; pick the first. Ties broken by vendorId
  // ascending for deterministic ordering.
  const sorted = [...candidates].sort(
    (a, b) => b.margin.minus(a.margin).toNumber() || a.vendorId - b.vendorId,
  );
  const best = sorted[0];

  return {
    vendorId: best.vendorId,
    purchasePrice: best.purchasePrice,
    reason: 'auto',
    candidates,
  };
}

// ─── Batch selection for a list of items ────────────────────
//
// Used by `finalizeOrder` — runs `selectVendorForProduct` for each item
// in the cart, in parallel. Returns a map of productId → selection result
// so the caller can snapshot vendorId + purchasePrice + reason onto
// each OrderItem.

export interface CartItemInput {
  productId: number;
  qty: number;
}

export async function selectVendorsForCart(
  items: CartItemInput[],
  prismaClient: PrismaClient = prisma,
): Promise<Map<number, VendorSelectionResult>> {
  // Run all selections in parallel. Each one does 2-3 small queries
  // (product + productVendors + maybe vendor). For a 10-item cart
  // that's ~30 queries, which is fine — they all run concurrently.
  //
  // For very large carts (100+ items) we'd want to batch the product +
  // productVendor loads into 2 bulk queries, but that's an optimization
  // for later.

  const entries = await Promise.all(
    items.map(async (item) => {
      // We need the effectivePrice to compute margins. Load it here
      // (cheap — single column by PK).
      const product = await prismaClient.product.findUnique({
        where: { id: item.productId },
        select: { salePrice: true, discountPrice: true },
      });
      if (!product) {
        throw new AppError(404, `Product ${item.productId} not found`);
      }
      const effectivePrice = product.discountPrice ?? product.salePrice;

      const selection = await selectVendorForProduct(item.productId, effectivePrice, prismaClient);
      return [item.productId, selection] as const;
    }),
  );

  return new Map(entries);
}
