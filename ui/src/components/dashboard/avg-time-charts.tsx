import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAvgTimePerDay, useDashboardSummary } from '@/hooks/use-dashboard';

export function AvgTimePerDayChart({ days = 30 }: { days?: number }) {
  const { data, isLoading } = useAvgTimePerDay(days);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avg time per day (minutes)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.data ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                labelFormatter={(d: unknown) =>
                  new Date(d as string).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                }
                formatter={(value: unknown) => [
                  value !== null ? `${value} min` : 'No deliveries',
                  'Avg time',
                ]}
              />
              <Line
                type="monotone"
                dataKey="avgMinutes"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-2))', r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function StepTimeBars() {
  const { data: summary, isLoading } = useDashboardSummary();

  const steps = [
    { label: 'Pending → Waiting Vendor', value: summary?.avgStepMinutes.pending_to_waiting_vendor },
    {
      label: 'Waiting Vendor → Preparing',
      value: summary?.avgStepMinutes.waiting_vendor_to_preparing,
    },
    { label: 'Preparing → Picked Up', value: summary?.avgStepMinutes.preparing_to_picked_up },
    { label: 'Picked Up → Delivered', value: summary?.avgStepMinutes.picked_up_to_delivered },
  ];

  const colors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avg time per step</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avg time per step (minutes)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="font-mono font-medium">
                {step.value !== null && step.value !== undefined ? `${step.value} min` : '—'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width:
                    step.value !== null && step.value !== undefined
                      ? `${Math.min(100, ((step.value as number) / 60) * 100)}%`
                      : '0%',
                  backgroundColor: colors[i],
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
