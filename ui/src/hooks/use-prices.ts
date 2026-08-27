import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  VendorProduct,
  VendorProductsResponse,
  BulkUpdatePricesPayload,
  BulkUpdatePricesResult,
} from '@/types/product';

// ─── List vendor products (GET /vendors/:id/products) ─────────
//
// Returns the vendor's full catalog (default-vendor products +
// ProductVendor-sourced products) with the vendor's per-vendor
// purchasePrice included. Used by the morning price-update page.

export interface VendorProductsQuery {
  categoryId?: number;
  search?: string;
  includeInactive?: boolean;
  limit?: number;
}

export function useVendorProducts(vendorId: number | 'all', query: VendorProductsQuery = {}) {
  return useQuery({
    queryKey: ['vendor-products', vendorId, query] as const,
    queryFn: async () => {
      if (vendorId === 'all') {
        return { data: [], vendor: { id: 0, name: '' } } as VendorProductsResponse;
      }
      const params = new URLSearchParams();
      if (query.categoryId) params.set('categoryId', String(query.categoryId));
      if (query.search) params.set('search', query.search);
      if (query.includeInactive !== undefined) {
        params.set('includeInactive', String(query.includeInactive));
      }
      if (query.limit) params.set('limit', String(query.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await api.get<VendorProductsResponse>(
        `/vendors/${vendorId}/products${qs}`,
      )) as VendorProductsResponse;
    },
    enabled: vendorId !== 'all' && vendorId > 0,
    staleTime: 30_000, // 30s — prices may change during the session
  });
}

// ─── Bulk update prices (POST /products/bulk-update-prices) ────
//
// The morning vendor-call workflow. Submits a batch of price updates
// for one vendor; the backend updates Product + ProductVendor +
// ProductPriceHistory in a single transaction.

export function useBulkUpdatePrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkUpdatePricesPayload) => {
      return (await api.post<BulkUpdatePricesResult>(
        '/products/bulk-update-prices',
        payload,
      )) as BulkUpdatePricesResult;
    },
    onSuccess: (result, payload) => {
      // Invalidate the vendor-products query so the new prices show up
      // immediately in the price-update page.
      queryClient.invalidateQueries({ queryKey: ['vendor-products', payload.vendorId] });
      // Also invalidate the general products queries (the products page,
      // the order page catalog, etc.) so they pick up the new prices.
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(
        `Updated ${result.updated} products · ${result.historyRows} history rows logged`,
      );
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Derived helper: which products have actually changed? ────
//
// Pure function — exported for testing + reuse in the page. Given the
// current vendor products (loaded) and the draft edits (a Map of
// productId → { purchasePrice, salePrice, discountPrice }), returns
// the array of BulkUpdatePriceItem to send to the backend. Empty array
// means "nothing to save".

export interface DraftPriceEdit {
  purchasePrice: number | null; // null = unchanged
  salePrice: number | null;
  discountPrice: number | null | 'clear'; // 'clear' = explicitly remove discount
}

export function diffPriceEdits(
  products: VendorProduct[],
  drafts: Map<number, DraftPriceEdit>,
): Array<{ productId: number; purchasePrice?: number; salePrice?: number; discountPrice?: number | null }> {
  const updates: Array<{
    productId: number;
    purchasePrice?: number;
    salePrice?: number;
    discountPrice?: number | null;
  }> = [];

  for (const p of products) {
    const draft = drafts.get(p.id);
    if (!draft) continue;

    const update: { productId: number; purchasePrice?: number; salePrice?: number; discountPrice?: number | null } = {
      productId: p.id,
    };

    // Purchase price: compare to vendor's current per-vendor price
    const currentP = Number(p.vendorPurchasePrice);
    if (draft.purchasePrice !== null && draft.purchasePrice !== currentP) {
      update.purchasePrice = draft.purchasePrice;
    }

    // Sale price: compare to product's current salePrice
    const currentS = Number(p.salePrice);
    if (draft.salePrice !== null && draft.salePrice !== currentS) {
      update.salePrice = draft.salePrice;
    }

    // Discount price: handle the three cases
    //   - draft is 'clear' (explicitly null)  → set null in the update
    //   - draft is a number and differs from current  → set the new value
    //   - draft is null (unchanged) OR same as current → omit
    const currentD = p.discountPrice ? Number(p.discountPrice) : null;
    if (draft.discountPrice === 'clear') {
      if (currentD !== null) update.discountPrice = null;
    } else if (draft.discountPrice !== null && draft.discountPrice !== currentD) {
      update.discountPrice = draft.discountPrice;
    }

    // Only include this product if at least one field changed
    if (
      update.purchasePrice !== undefined ||
      update.salePrice !== undefined ||
      update.discountPrice !== undefined
    ) {
      updates.push(update);
    }
  }

  return updates;
}
