import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  DashboardSummaryResponse,
  DailyCountResponse,
  DailyAvgTimeResponse,
  CategoryBreakdownResponse,
} from '@/types/dashboard';

// ─── Summary (GET /dashboard/summary?month=YYYY-MM) ───────────

export function useDashboardSummary(month?: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', month] as const,
    queryFn: async () => {
      const qs = month ? `?month=${month}` : '';
      return (await api.get<DashboardSummaryResponse>(
        `/dashboard/summary${qs}`,
      )) as DashboardSummaryResponse;
    },
  });
}

// ─── Orders per day (GET /dashboard/orders-per-day?days=N) ────

export function useOrdersPerDay(days: number = 30) {
  return useQuery({
    queryKey: ['dashboard', 'orders-per-day', days] as const,
    queryFn: async () => {
      return (await api.get<DailyCountResponse>(
        `/dashboard/orders-per-day?days=${days}`,
      )) as DailyCountResponse;
    },
  });
}

// ─── Avg time per day (GET /dashboard/avg-time-per-day?days=N) ─

export function useAvgTimePerDay(days: number = 30) {
  return useQuery({
    queryKey: ['dashboard', 'avg-time-per-day', days] as const,
    queryFn: async () => {
      return (await api.get<DailyAvgTimeResponse>(
        `/dashboard/avg-time-per-day?days=${days}`,
      )) as DailyAvgTimeResponse;
    },
  });
}

// ─── Category breakdown (GET /dashboard/category-breakdown?month=YYYY-MM) ─

export function useCategoryBreakdown(month?: string) {
  return useQuery({
    queryKey: ['dashboard', 'category-breakdown', month] as const,
    queryFn: async () => {
      const qs = month ? `?month=${month}` : '';
      return (await api.get<CategoryBreakdownResponse>(
        `/dashboard/category-breakdown${qs}`,
      )) as CategoryBreakdownResponse;
    },
  });
}
