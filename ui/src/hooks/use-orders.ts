import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  OrderResponse,
  FinalizeOrderPayload,
  PublicOrder,
  PaginatedPendingOrders,
  PaginatedDoneOrders,
  OrderVendorGroups,
  AuditLog,
  OrderStatus,
} from '@/types/order';

// ─── Finalize (POST /orders) ───────────────────────────────────

export function useFinalizeOrder() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (payload: FinalizeOrderPayload) => {
      const data = (await api.post<OrderResponse>('/orders', payload)) as OrderResponse;
      return data.order;
    },
    onSuccess: (order: PublicOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Order ${order.orderCode} created`);
      navigate('/orders/pending');
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Order detail (GET /orders/:id) ────────────────────────────

export function useOrder(id: number) {
  return useQuery({
    queryKey: ['orders', 'detail', id] as const,
    queryFn: async () => {
      const data = (await api.get<OrderResponse>(`/orders/${id}`)) as OrderResponse;
      return data.order;
    },
    enabled: id > 0,
  });
}

// ─── Vendor groups (GET /orders/:id/vendor-groups) ─────────────

export function useOrderVendorGroups(orderId: number, enabled = true) {
  return useQuery({
    queryKey: ['orders', 'vendor-groups', orderId] as const,
    queryFn: async () => {
      return (await api.get<OrderVendorGroups>(
        `/orders/${orderId}/vendor-groups`,
      )) as OrderVendorGroups;
    },
    enabled: enabled && orderId > 0,
  });
}

// ─── Audit log (GET /orders/:id/audit-log) ────────────────────

export function useOrderAuditLog(orderId: number, enabled = true) {
  return useQuery({
    queryKey: ['orders', 'audit-log', orderId] as const,
    queryFn: async () => {
      return (await api.get<AuditLog>(`/orders/${orderId}/audit-log`)) as AuditLog;
    },
    enabled: enabled && orderId > 0,
  });
}

// ─── Update status (PATCH /orders/:id/status) ──────────────────

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      note,
    }: {
      id: number;
      status: OrderStatus;
      note?: string;
    }) => {
      const data = (await api.patch<OrderResponse>(`/orders/${id}/status`, {
        status,
        ...(note ? { note } : {}),
      })) as OrderResponse;
      return data.order;
    },
    onSuccess: (order: PublicOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Status updated to ${order.status}`);
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Add item (POST /orders/:id/items) ────────────────────────

export function useAddOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      productId,
      qty,
    }: {
      orderId: number;
      productId: number;
      qty: number;
    }) => {
      const data = (await api.post<OrderResponse>(`/orders/${orderId}/items`, {
        productId,
        qty,
      })) as OrderResponse;
      return data.order;
    },
    onSuccess: (_order: PublicOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Item added to order');
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Remove item (DELETE /orders/:id/items/:itemId) ────────────

export function useRemoveOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: number; itemId: number }) => {
      const data = (await api.delete<OrderResponse>(
        `/orders/${orderId}/items/${itemId}`,
      )) as OrderResponse;
      return data.order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Item removed from order');
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Change item vendor (PATCH /orders/:id/items/:itemId/vendor) ──
//
// Phase 4 (2026-08-28): manually override the vendor for an order item.
// Used by the vendor-groups modal's per-item vendor dropdown.

export function useChangeItemVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      itemId,
      vendorId,
    }: {
      orderId: number;
      itemId: number;
      vendorId: number;
    }) => {
      const data = (await api.patch<OrderResponse>(
        `/orders/${orderId}/items/${itemId}/vendor`,
        { vendorId },
      )) as OrderResponse;
      return data.order;
    },
    onSuccess: (_order, variables) => {
      // Invalidate the order detail + vendor-groups (the groups change
      // when an item's vendor changes).
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({
        queryKey: ['orders', 'vendor-groups', variables.orderId],
      });
      toast.success('Vendor changed');
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Cancel order (DELETE /orders/:id) ──────────────────────────

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: number; note?: string }) => {
      const data = (await api.delete<OrderResponse>(`/orders/${id}`, {
        data: { ...(note ? { note } : {}) },
      })) as OrderResponse;
      return data.order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Order cancelled');
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Pending list (GET /orders/pending) ────────────────────────

export interface PendingOrdersQuery {
  customer?: string;
  page?: number;
  limit?: number;
}

export function usePendingOrders(query: PendingOrdersQuery = {}) {
  return useQuery({
    queryKey: ['orders', 'pending', query] as const,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.customer) params.set('customer', query.customer);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await api.get<PaginatedPendingOrders>(
        `/orders/pending${qs}`,
      )) as PaginatedPendingOrders;
    },
    refetchInterval: 30_000,
  });
}

// ─── Done list (GET /orders/done) ──────────────────────────────

export interface DoneOrdersQuery {
  page?: number;
  limit?: number;
  month?: string;
  search?: string;
}

export function useDoneOrders(query: DoneOrdersQuery = {}) {
  return useQuery({
    queryKey: ['orders', 'done', query] as const,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.month) params.set('month', query.month);
      if (query.search) params.set('search', query.search);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await api.get<PaginatedDoneOrders>(`/orders/done${qs}`)) as PaginatedDoneOrders;
    },
  });
}

// ─── Push-sell suggestions (POST /orders/suggestions) ──────────
//
// Smart cross-sell. Given the current cart contents (list of productIds),
// returns ranked additional products the customer might also want,
// based on co-purchase history + essentials + active discounts.
//
// `productIds` is the source of truth — the hook refetches whenever the
// cart changes. We serialize the array as JSON body (POST, not GET) so
// the request can carry many productIds without URL-length limits.

import type { OrderSuggestionsResponse, SuggestedProduct } from '@/types/product';

export function useOrderSuggestions(productIds: number[], enabled = true) {
  // Sort + dedup so the query key is stable across re-renders (otherwise
  // every cart mutation would refetch even if the set of ids is the same).
  const stableKey = [...productIds].sort((a, b) => a - b).join(',');

  return useQuery({
    queryKey: ['orders', 'suggestions', stableKey] as const,
    queryFn: async () => {
      if (productIds.length === 0) {
        return { data: [] } as OrderSuggestionsResponse;
      }
      return (await api.post<OrderSuggestionsResponse>('/orders/suggestions', {
        productIds,
        limit: 8,
      })) as OrderSuggestionsResponse;
    },
    // Only fetch when the cart has at least 1 item (no suggestions for
    // an empty cart) and the consumer has explicitly enabled the hook.
    enabled: enabled && productIds.length > 0,
    staleTime: 30_000, // 30s — co-purchase stats don't change fast
  });
}

// Re-export the type for convenience
export type { SuggestedProduct };
