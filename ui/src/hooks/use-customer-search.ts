import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { RecentCustomer } from '@/types/customer';

/**
 * Repeat-customer lookup.
 *
 * Reuses `GET /orders?search=` (which does case-insensitive partial match on
 * customer name OR phone) and de-duplicates the results by phone, keeping
 * the most recent order per phone. The operator can then click a suggestion
 * to autofill the new-order customer fields.
 *
 * There is no standalone `/customers` endpoint — Rizqun stores customer info
 * denormalized on each order row, so we derive the "customer directory"
 * client-side from past orders.
 */

interface OrderListRow {
  id: number;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
}

interface OrderListResponse {
  data: OrderListRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Search past customers by name or phone.
 *
 * The query is debounced by the caller (via `enabled` gate) — React Query
 * also caches results so identical queries don't refetch.
 */
export function useCustomerSearch(query: string, enabled = true) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['customers', 'search', trimmed] as const,
    queryFn: async () => {
      const params = new URLSearchParams({
        search: trimmed,
        limit: '50', // generous — we dedupe client-side
      });
      return (await api.get<OrderListResponse>(
        `/orders?${params.toString()}`,
      )) as OrderListResponse;
    },
    enabled: enabled && trimmed.length >= 2,
    staleTime: 30_000, // 30s — names/phones don't change often
    gcTime: 60_000,
  });
}

/**
 * Convenience wrapper: returns the deduped `RecentCustomer[]` derived from
 * the raw order rows. Use this in components so they don't need to know
 * about the order-row → customer deduplication step.
 */
export function useRecentCustomers(query: string, enabled = true) {
  const { data, isFetching, error } = useCustomerSearch(query, enabled);

  const customers = useMemo<RecentCustomer[]>(() => {
    const rows = data?.data ?? [];
    if (rows.length === 0) return [];

    // Group by phone, keep the most recent order per phone.
    const byPhone = new Map<string, RecentCustomer>();
    for (const row of rows) {
      const key = row.customerPhone;
      const existing = byPhone.get(key);
      if (!existing) {
        byPhone.set(key, {
          phone: row.customerPhone,
          name: row.customerName,
          address: null,
          orderCount: 1,
          lastOrderAt: row.createdAt,
          lastOrderCode: row.orderCode,
        });
        continue;
      }
      existing.orderCount += 1;
      if (row.createdAt > existing.lastOrderAt) {
        existing.lastOrderAt = row.createdAt;
        existing.lastOrderCode = row.orderCode;
        existing.name = row.customerName; // latest spelling wins
      }
    }

    // Sort by most recent first.
    return Array.from(byPhone.values()).sort(
      (a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt),
    );
  }, [data]);

  return { customers, isFetching, error };
}
