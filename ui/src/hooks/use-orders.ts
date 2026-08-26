import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  OrderResponse,
  FinalizeOrderPayload,
  PublicOrder,
  PaginatedPendingOrders,
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
      // Invalidate everything related to orders so the pending list
      // picks up the new order.
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Order ${order.orderCode} created`);
      // Navigate to the pending list so the operator sees their new order
      navigate('/orders/pending');
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
    // Auto-refresh every 30s so the operator sees new orders without
    // manually refreshing
    refetchInterval: 30_000,
  });
}
