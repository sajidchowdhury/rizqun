import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Search, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDoneOrders } from '@/hooks/use-orders';
import { formatBDT } from '@/contexts/cart-store';

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

export function OrdersDonePage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [month, setMonth] = useState<string>('all');

  const monthOptions = getMonthOptions();

  // Debounce search
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    const t = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(t);
  }

  function handleMonthChange(value: string) {
    setMonth(value);
    setPage(1);
  }

  const { data, isLoading } = useDoneOrders({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    month: month === 'all' ? undefined : month,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CheckCircle2 className="size-6 text-emerald-500" />
            Done Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Delivered orders. Filter by month or search by customer.
          </p>
        </div>
        <Button onClick={() => navigate('/orders/new')}>New order</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by customer name or phone…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={month} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Delivered orders {data?.pagination ? `(${data.pagination.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No delivered orders for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.data.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <TableCell className="font-mono text-sm font-medium">
                          {order.orderCode}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{order.customerName}</div>
                          <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                        </TableCell>
                        <TableCell>{order.itemsCount}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBDT(Number(order.total))}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          {order.rating ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Star className="size-3 fill-amber-400 text-amber-400" />
                                <span className="text-xs font-medium">
                                  {order.rating.overall}.0
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({order.rating.speed}/{order.rating.behavior})
                                </span>
                              </div>
                              {order.rating.comment && (
                                <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                                  "{order.rating.comment}"
                                </p>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Awaiting
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/${order.id}`);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.totalPages} (
                    {data.pagination.total} orders)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                      disabled={page >= data.pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
