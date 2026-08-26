import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  OrderResponse,
  FinalizeOrderPayload,
  PublicOrder,
  PaginatedPendingOrders,
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
