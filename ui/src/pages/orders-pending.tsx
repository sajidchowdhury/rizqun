import { useEffect, useState } from 'react';
import { Clock, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useNavigate } from 'react-router-dom';
import { usePendingOrders } from '@/hooks/use-orders';
import type { OrderStatus } from '@/types/order';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  waiting_vendor: 'Waiting Vendor',
  preparing: 'Preparing',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_VARIANTS: Record<OrderStatus, 'secondary' | 'default' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  waiting_vendor: 'secondary',
  preparing: 'default',
  picked_up: 'default',
  delivered: 'default',
  cancelled: 'destructive',
};

/** Returns a Tailwind text color class based on order age (minutes since created). */
function ageColor(minutes: number): string {
  if (minutes > 60) return 'text-destructive font-bold';
  if (minutes > 30) return 'text-orange-600 font-semibold';
  if (minutes > 10) return 'text-yellow-600';
  return 'text-muted-foreground';
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
}

export function OrdersPendingPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = usePendingOrders({
    customer: debouncedSearch || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pending Orders</h1>
          <p className="text-sm text-muted-foreground">
            In-flight orders (pending, waiting vendor, preparing). Auto-refreshes every 30s.
          </p>
        </div>
        <Button onClick={() => navigate('/orders/new')}>New order</Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by customer name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Pending orders {data?.pagination ? `(${data.pagination.total})` : ''}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No pending orders. Click "New order" to create one.
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
                        ৳{Number(order.total).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm ${ageColor(order.minutesSinceCreated)}`}>
                          <Clock className="mr-1 inline size-3" />
                          {formatAge(order.minutesSinceCreated)}
                        </span>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
