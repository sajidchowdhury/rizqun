import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HealthStatus {
  status: string;
  database?: { status: string; latencyMs?: number };
}

/**
 * Live backend health indicator — shows a green "Online" badge when
 * the backend + database are reachable, or a red "Offline" badge when
 * the backend is down. Polls every 30 seconds.
 *
 * Mounted in the topbar so the user can instantly see whether the
 * "Couldn't reach the server" errors are due to the backend being down.
 */
export function HealthIndicator() {
  const { data, isError } = useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: async () => {
      return (await api.get('/health')) as HealthStatus;
    },
    // Don't retry — we want to show "Offline" immediately, not spin
    retry: false,
    // Poll every 30s so the badge flips back to "Online" automatically
    // when the backend comes back up
    refetchInterval: 30_000,
    // Start with a stale-but-optimistic query so the UI doesn't flash
    // "Offline" on first render before the query resolves
    staleTime: 0,
  });

  const isOnline = !isError && data?.status === 'ok';
  const dbOk = data?.database?.status === 'ok';

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 text-xs',
        isOnline
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
      title={
        isOnline
          ? `Backend: ${data?.status}, DB: ${data?.database?.status} (${data?.database?.latencyMs}ms)`
          : 'Backend is not reachable. Start the backend with: cd D:\\DeveloperHub\\rizqun && npm start'
      }
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          isOnline ? 'bg-emerald-500' : 'bg-destructive',
          isOnline ? 'animate-pulse' : '',
        )}
      />
      {isOnline ? (dbOk ? 'Online' : 'DB Error') : 'Offline'}
    </Badge>
  );
}
