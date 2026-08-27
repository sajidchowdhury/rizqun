import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarClock,
  Loader2,
  Package,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProductSearch } from '@/hooks/use-products';
import {
  useProductPriceHistory,
  useVendorStability,
  useVendorProfitability,
} from '@/hooks/use-prices';
import { formatBDT } from '@/contexts/cart-store';
import type { PriceHistoryEntry } from '@/types/product';

// ─── Page ─────────────────────────────────────────────────────

const STABILITY_DAYS_OPTIONS = [7, 14, 30, 90];

export function PricesHistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Price History</h1>
        <p className="text-sm text-muted-foreground">
          Track price changes over time, see which vendors change prices most, and which vendors are most profitable.
        </p>
      </header>

      {/* Section 1: Per-product price chart */}
      <ProductPriceChartSection />

      {/* Section 2 + 3: Two-column layout on desktop */}
      <div className="grid gap-6 lg:grid-cols-2">
        <VendorStabilitySection />
        <VendorProfitabilitySection />
      </div>
    </div>
  );
}

// ─── Section 1: Per-product price-over-time chart ──────────────
//
// Pick a product (via search) → line chart showing effectivePrice +
// purchasePrice over time. Each data point is one price-change entry.

function ProductPriceChartSection() {
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | 'all'>('all');
  const [selectedName, setSelectedName] = useState<string>('');

  // Debounce isn't needed — useProductSearch already handles that
  const { data: searchResults, isFetching: searching } = useProductSearch(
    search,
    search.trim().length >= 2,
  );

  const { data: history, isLoading } = useProductPriceHistory(selectedProductId);

  function pickProduct(productId: number, name: string) {
    setSelectedProductId(productId);
    setSelectedName(name);
    setSearch('');
  }

  function clearSelection() {
    setSelectedProductId('all');
    setSelectedName('');
    setSearch('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="size-4" />
          Price over time
        </CardTitle>
        <CardDescription>
          Pick a product to see how its prices changed over time. The green line is what the customer pays (effective price); the orange line is what we pay the vendor (purchase price).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Product picker */}
        <div className="relative">
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Product
          </Label>
          {selectedProductId !== 'all' ? (
            // Show the selected product as a chip
            <div className="flex items-center justify-between rounded-lg border bg-background p-2.5">
              <span className="truncate text-sm font-medium">{selectedName}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={clearSelection}
                aria-label="Clear product selection"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-lg pl-9 pr-9 text-sm"
                  autoComplete="off"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {/* Search results dropdown */}
              {search.trim().length >= 2 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                  {searching && (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Searching…
                    </div>
                  )}
                  {!searching && (searchResults?.data.length ?? 0) === 0 && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      No products found.
                    </div>
                  )}
                  {!searching &&
                    (searchResults?.data.length ?? 0) > 0 &&
                    searchResults?.data.slice(0, 10).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickProduct(p.id, p.name)}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.categoryName} · {p.vendorName}
                          </div>
                        </div>
                        <span className="ml-2 shrink-0 font-mono text-xs">
                          {formatBDT(Number(p.effectivePrice))}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Chart or empty state */}
        {selectedProductId === 'all' ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <Package className="size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">Pick a product to see its price history</p>
            <p className="text-xs text-muted-foreground">
              Search above and select a product to view its price-over-time chart.
            </p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (history?.data.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <CalendarClock className="size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">No price changes recorded yet</p>
            <p className="text-xs text-muted-foreground">
              When you update this product's prices via the morning workflow or the edit dialog, history entries will appear here.
            </p>
          </div>
        ) : (
          <PriceHistoryChart entries={history?.data ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Price history chart ──────────────────────────────────────
//
// Line chart with two lines:
//   - effectivePrice (green) — what the customer pays
//   - purchasePrice (orange) — what we pay the vendor
// The gap between them is the margin.

function PriceHistoryChart({ entries }: { entries: PriceHistoryEntry[] }) {
  // Reverse so oldest is first (better for time-series chart)
  const data = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
      .map((e) => ({
        date: new Date(e.changedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        }),
        fullDate: e.changedAt,
        effectivePrice: Number(e.effectivePrice),
        purchasePrice: Number(e.purchasePrice),
        vendorName: e.vendorName ?? '—',
        note: e.note,
      }));
  }, [entries]);

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `৳${v}`}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value: unknown, name: unknown) => {
              const label = name === 'effectivePrice' ? 'Customer price' : 'Vendor price';
              return [formatBDT(Number(value)), label];
            }}
            labelFormatter={(label: unknown) => {
              const point = data.find((d) => d.date === label);
              if (!point) return String(label);
              const date = new Date(point.fullDate).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
              const vendor =
                point.vendorName !== '—' ? ` · ${point.vendorName}` : '';
              const note = point.note ? ` · ${point.note}` : '';
              return `${date}${vendor}${note}`;
            }}
          />
          <Line
            type="stepAfter"
            dataKey="effectivePrice"
            stroke="hsl(var(--commerce))"
            strokeWidth={2}
            dot={{ r: 3, fill: 'hsl(var(--commerce))' }}
            activeDot={{ r: 5 }}
            name="effectivePrice"
          />
          <Line
            type="stepAfter"
            dataKey="purchasePrice"
            stroke="hsl(38, 92%, 50%)"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={{ r: 3, fill: 'hsl(38, 92%, 50%)' }}
            activeDot={{ r: 5 }}
            name="purchasePrice"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full bg-commerce" />
          Customer price (effective)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
          Vendor purchase price
        </span>
      </div>
    </div>
  );
}

// ─── Section 2: Vendor stability ranking ──────────────────────
//
// Table: vendor name, change count, avg magnitude, last change date.
// Sorted by change count descending (most-changed vendors first).

function VendorStabilitySection() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useVendorStability(days);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="size-4" />
              Vendor stability
            </CardTitle>
            <CardDescription>
              Which vendors change prices most often (lower is more stable).
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {STABILITY_DAYS_OPTIONS.map((d) => (
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
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
            <TrendingDown className="size-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm font-medium">No price changes in the last {days} days</p>
            <p className="text-xs text-muted-foreground">
              When you update prices via the morning workflow, vendors will appear here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Vendor</TableHead>
                <TableHead className="text-right text-xs">Changes</TableHead>
                <TableHead className="text-right text-xs">Avg Δ</TableHead>
                <TableHead className="text-right text-xs">Last change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.map((row) => (
                <TableRow key={row.vendorId}>
                  <TableCell className="font-medium">{row.vendorName}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-semibold',
                        row.changeCount >= 10
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          : row.changeCount >= 3
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-commerce-soft text-commerce-soft-foreground',
                      )}
                    >
                      {row.changeCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {row.avgChangeMagnitude > 0 ? `৳${row.avgChangeMagnitude}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {row.lastChangeAt
                      ? new Date(row.lastChangeAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: '2-digit',
                        })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 3: Vendor profitability report ──────────────────
//
// Month-picker + bar chart + table: vendor name, order count, total
// margin, total revenue. Sorted by total margin descending.

function VendorProfitabilitySection() {
  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);

  const { data, isLoading } = useVendorProfitability(month);

  // Build the last 12 months for the picker
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      opts.push(m);
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return opts;
  }, []);

  const chartData = useMemo(
    () =>
      (data?.data ?? []).map((r) => ({
        name: r.vendorName,
        margin: Number(r.totalMargin),
        revenue: Number(r.totalRevenue),
      })),
    [data],
  );

  const totalMargin = useMemo(
    () => (data?.data ?? []).reduce((sum, r) => sum + Number(r.totalMargin), 0),
    [data],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" />
              Profit per vendor
            </CardTitle>
            <CardDescription>
              Total margin from delivered orders this month.
            </CardDescription>
          </div>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-7 w-[130px] rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
            <Users className="size-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm font-medium">No delivered orders in {month}</p>
            <p className="text-xs text-muted-foreground">
              Vendors will appear here once orders are delivered in this month.
            </p>
          </div>
        ) : (
          <>
            {/* Total margin summary */}
            <div className="flex items-center justify-between rounded-lg bg-commerce-soft px-4 py-2.5">
              <span className="text-xs font-medium text-commerce-soft-foreground">
                Total profit margin
              </span>
              <span className="font-mono text-lg font-semibold text-commerce">
                {formatBDT(totalMargin)}
              </span>
            </div>

            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `৳${v}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown) => formatBDT(Number(value))}
                />
                <Bar
                  dataKey="margin"
                  fill="hsl(var(--commerce))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Detail table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Vendor</TableHead>
                  <TableHead className="text-right text-xs">Orders</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-right text-xs">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((row) => (
                  <TableRow key={row.vendorId}>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell className="text-right text-sm">{row.orderCount}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatBDT(Number(row.totalRevenue))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-commerce">
                      {formatBDT(Number(row.totalMargin))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
