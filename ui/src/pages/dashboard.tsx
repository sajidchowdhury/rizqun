import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useDashboardSummary } from '@/hooks/use-dashboard';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { OrdersPerDayChart } from '@/components/dashboard/orders-per-day-chart';
import { AvgTimePerDayChart, StepTimeBars } from '@/components/dashboard/avg-time-charts';
import { CategoryBreakdownChart } from '@/components/dashboard/category-breakdown-chart';

// Generate the last 12 months as options for the month filter
function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

export function DashboardPage() {
  const [month, setMonth] = useState<string>('all');
  const monthOptions = getMonthOptions();

  const monthParam = month === 'all' ? undefined : month;
  const { data: summary, isLoading } = useDashboardSummary(monthParam);

  const stepValues = summary
    ? [
        summary.avgStepMinutes.pending_to_waiting_vendor,
        summary.avgStepMinutes.waiting_vendor_to_preparing,
        summary.avgStepMinutes.preparing_to_picked_up,
        summary.avgStepMinutes.picked_up_to_delivered,
      ]
    : [null, null, null, null];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Monthly metrics and delivery trends.</p>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Current month</SelectItem>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Done Count"
          value={summary?.doneCount ?? 0}
          description={summary ? `For ${summary.month}` : undefined}
          isLoading={isLoading}
        />
        <KpiCard
          title="Avg Total Time"
          value={
            summary?.avgTotalMinutes !== null && summary?.avgTotalMinutes !== undefined
              ? `${summary.avgTotalMinutes} min`
              : '—'
          }
          description="Creation to delivery"
          isLoading={isLoading}
        />
        <KpiCard
          title="Avg Step Time"
          value={
            stepValues.every((v) => v !== null)
              ? `${Math.min(...(stepValues.filter((v) => v !== null) as number[])).toFixed(1)}–${Math.max(...(stepValues.filter((v) => v !== null) as number[])).toFixed(1)}`
              : '—'
          }
          description="Range across 4 steps"
          isLoading={isLoading}
        />
        <KpiCard
          title="Month"
          value={summary?.month ?? '—'}
          description="Selected period"
          isLoading={isLoading}
        />
      </div>

      {/* Charts — row 1: bar + line */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OrdersPerDayChart />
        <AvgTimePerDayChart days={30} />
      </div>

      {/* Charts — row 2: step bars + donut */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StepTimeBars />
        <CategoryBreakdownChart month={monthParam} />
      </div>
    </div>
  );
}
