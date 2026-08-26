import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/types/api';

/**
 * React Query client (singleton).
 *
 * Configuration:
 *   - staleTime: 30s — short enough to pick up backend changes, long enough
 *     to avoid hammering the API on tab switches / re-renders.
 *   - gcTime: 5 min — keep stale data cached for back/forward navigation.
 *   - retry: 1 — one retry on transient network errors. Don't retry 4xx
 *     (they'll just fail the same way) but DO retry 5xx (server might recover).
 *   - refetchOnWindowFocus: false — operator workflow doesn't need
 *     instant refresh on focus; we'll handle pending-list refetch explicitly
 *     via refetchInterval in Phase 3.5.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          // Never retry client errors (4xx) — they will fail the same way.
          if (error.status >= 400 && error.status < 500) return false;
        }
        // Retry once on everything else (network errors, 5xx).
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations are NOT retried — repeated POST /orders would create
      // duplicate records. The user should see the error and retry manually.
      retry: false,
    },
  },
});
