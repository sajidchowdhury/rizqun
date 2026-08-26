import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategoryBreakdown } from '@/hooks/use-dashboard';

const COLORS: Record<string, string> = {
  grocery: 'hsl(142 71% 45%)',
  medicine: 'hsl(217 91% 60%)',
  other: 'hsl(280 50% 55%)',
};

export function CategoryBreakdownChart({ month }: { month?: string }) {
  const { data, isLoading } = useCategoryBreakdown(month);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (data?.data ?? []).map((c) => ({
    name: c.categoryName,
    value: c.orderCount,
    slug: c.categorySlug,
  }));

  const total = chartData.reduce((sum, c) => sum + c.value, 0);

  if (chartData.length === 0 || total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No data for this month.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Category breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={160}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.slug}
                    fill={COLORS[entry.slug] ?? 'hsl(var(--muted-foreground))'}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                formatter={(value: unknown) => [`${value} orders`, 'Count']}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend + total */}
          <div className="flex-1 space-y-2">
            <div className="text-center">
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">total orders</div>
            </div>
            <div className="space-y-1">
              {chartData.map((entry) => (
                <div key={entry.slug} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        backgroundColor: COLORS[entry.slug] ?? 'hsl(var(--muted-foreground))',
                      }}
                    />
                    <span>{entry.name}</span>
                  </div>
                  <span className="font-mono text-sm">
                    {entry.value} ({Math.round((entry.value / total) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
