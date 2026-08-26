import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrdersPerDay } from '@/hooks/use-dashboard';
import { cn } from '@/lib/utils';

const DAYS_OPTIONS = [7, 14, 30, 90];

export function OrdersPerDayChart() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useOrdersPerDay(days);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Orders per day</CardTitle>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map((d) => (
              <Button
                key={d}
                variant={days === d ? 'default' : 'outline'}
                size="xs"
                onClick={() => setDays(d)}
                className={cn('h-7 px-2 text-xs')}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.data ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
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
                formatter={(value: unknown) => [`${value} orders`, 'Count']}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                // Highlight today's bar
                shape={(props: {
                  payload?: { date?: string };
                  fill?: string;
                  x?: number;
                  y?: number;
                  width?: number;
                  height?: number;
                }) => {
                  const isToday = props.payload?.date === today;
                  return (
                    <rect
                      x={props.x}
                      y={props.y}
                      width={props.width}
                      height={props.height}
                      fill={isToday ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.6)'}
                      rx={4}
                      ry={4}
                    />
                  );
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
