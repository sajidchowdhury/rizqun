import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  History,
  Package,
  Phone,
  Plus,
  Star,
  Trash2,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useOrder,
  useOrderAuditLog,
  useUpdateOrderStatus,
  useRemoveOrderItem,
  useCancelOrder,
} from '@/hooks/use-orders';
import { VendorGroupsModal } from '@/components/orders/vendor-groups-modal';
import { AddItemModal } from '@/components/orders/add-item-modal';
import { RatingLinkDialog } from '@/components/ratings/rating-link-dialog';
import { formatBDT } from '@/contexts/cart-store';
import type { OrderStatus } from '@/types/order';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  waiting_vendor: 'Waiting Vendor',
  preparing: 'Preparing',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_VARIANTS: Record<string, 'secondary' | 'default' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  waiting_vendor: 'secondary',
  preparing: 'default',
  picked_up: 'default',
  delivered: 'default',
  cancelled: 'destructive',
};

const TRANSITIONS: Record<string, OrderStatus[]> = {
  pending: ['waiting_vendor', 'cancelled'],
  waiting_vendor: ['preparing', 'cancelled'],
  preparing: ['picked_up', 'cancelled'],
  picked_up: ['delivered'],
  delivered: [],
  cancelled: [],
};

const EDITABLE_STATUSES = ['pending', 'waiting_vendor', 'preparing'];

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id) || 0;
  const navigate = useNavigate();

  const { data: order, isLoading } = useOrder(orderId);
  const { data: auditLog } = useOrderAuditLog(orderId);
  const updateStatus = useUpdateOrderStatus();
  const removeItem = useRemoveOrderItem();
  const cancelOrder = useCancelOrder();

  const [vendorGroupsOpen, setVendorGroupsOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [ratingLinkOpen, setRatingLinkOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [removeTarget, setRemoveTarget] = useState<{ itemId: number; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-lg text-muted-foreground">Order not found.</p>
        <Button onClick={() => navigate('/orders/pending')}>Back to pending</Button>
      </div>
    );
  }

  const isEditable = EDITABLE_STATUSES.includes(order.status);
  const nextTransitions = TRANSITIONS[order.status] ?? [];
  const isTerminal = order.status === 'delivered' || order.status === 'cancelled';
  const statusTransitions = nextTransitions.filter((s) => s !== 'cancelled');

  function handleStatusTransition(status: OrderStatus) {
    updateStatus.mutate({ id: orderId, status });
  }

  function handleCancel() {
    cancelOrder.mutate(
      { id: orderId, note: cancelNote.trim() || undefined },
      { onSuccess: () => setCancelOpen(false) },
    );
  }

  function handleRemoveItem() {
    if (!removeTarget) return;
    removeItem.mutate(
      { orderId, itemId: removeTarget.itemId },
      { onSuccess: () => setRemoveTarget(null) },
    );
  }

  function copyToClipboard(text: string, _label: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" />
        Back
      </Button>

      {/* Order header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.orderCode}</h1>
            <Badge variant={STATUS_VARIANTS[order.status]}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {new Date(order.createdAt).toLocaleString()}
            {order.deliveredAt && ` · Delivered ${new Date(order.deliveredAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setVendorGroupsOpen(true)}
            disabled={order.items.length === 0}
          >
            <Package className="size-4" />
            Vendor groups
          </Button>
          {order.status === 'delivered' && (
            <Button variant="outline" onClick={() => setRatingLinkOpen(true)}>
              <Star className="size-4" />
              Send rating link
            </Button>
          )}
          {isEditable && (
            <Button variant="outline" onClick={() => setAddItemOpen(true)}>
              <Plus className="size-4" />
              Add item
            </Button>
          )}
          {/* Status transitions */}
          {!isTerminal && statusTransitions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  Update status
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {statusTransitions.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleStatusTransition(status)}
                    disabled={updateStatus.isPending}
                  >
                    → {STATUS_LABELS[status]}
                  </DropdownMenuItem>
                ))}
                {nextTransitions.includes('cancelled' as OrderStatus) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setCancelOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      Cancel order
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: Items + totals */}
        <div className="space-y-4">
          {/* Customer info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="size-4 text-muted-foreground" />
                <span className="font-medium">{order.customerName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground" />
                <a
                  href={`tel:${order.customerPhone}`}
                  className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                >
                  {order.customerPhone}
                </a>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copyToClipboard(order.customerPhone, 'Phone')}
                  aria-label="Copy phone"
                >
                  <Copy className="size-3" />
                </Button>
              </div>
              {order.customerAddress && (
                <div className="text-sm text-muted-foreground">{order.customerAddress}</div>
              )}
            </CardContent>
          </Card>

          {/* Items table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items ({order.items.length})</CardTitle>
                {isEditable && (
                  <Button variant="ghost" size="sm" onClick={() => setAddItemOpen(true)}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {isEditable && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.addedAfterFinalize && (
                            <Badge variant="secondary" className="text-[10px]">
                              NEW
                            </Badge>
                          )}
                          <span className="font-medium">{item.productNameSnapshot}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.qty}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatBDT(Number(item.priceSnapshot))}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatBDT(Number(item.lineTotal))}
                      </TableCell>
                      {isEditable && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              setRemoveTarget({ itemId: item.id, name: item.productNameSnapshot })
                            }
                            className="text-destructive hover:text-destructive"
                            aria-label={`Remove ${item.productNameSnapshot}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatBDT(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery fee</span>
                <span className="font-mono">{formatBDT(Number(order.deliveryFee))}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-medium">
                <span>Total</span>
                <span className="font-mono">{formatBDT(Number(order.total))}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Status timeline */}
        <Card className="sticky top-20 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              Status timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLog ? (
              <div className="space-y-0">
                {auditLog.entries.map((entry, i) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`size-2.5 rounded-full ${
                          entry.toStatus === 'cancelled'
                            ? 'bg-destructive'
                            : entry.toStatus === 'delivered'
                              ? 'bg-emerald-500'
                              : 'bg-primary'
                        }`}
                      />
                      {i < auditLog.entries.length - 1 && (
                        <div className="mt-1 w-px flex-1 bg-border" style={{ minHeight: '2rem' }} />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="text-sm font-medium">
                        {entry.fromStatus
                          ? `${STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} → ${STATUS_LABELS[entry.toStatus] ?? entry.toStatus}`
                          : `Created as ${STATUS_LABELS[entry.toStatus] ?? entry.toStatus}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(entry.changedAt).toLocaleString()}
                      </div>
                      {entry.note && (
                        <div className="mt-0.5 text-xs text-muted-foreground">"{entry.note}"</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <VendorGroupsModal
        orderId={orderId}
        orderCode={order.orderCode}
        orderStatus={order.status}
        open={vendorGroupsOpen}
        onOpenChange={setVendorGroupsOpen}
      />
      <AddItemModal orderId={orderId} open={addItemOpen} onOpenChange={setAddItemOpen} />

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel order {order.orderCode}?</DialogTitle>
            <DialogDescription>
              This will set the order status to "cancelled". The order remains in the system for
              audit purposes but can no longer be modified.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancel-note">Reason (optional)</Label>
            <Input
              id="cancel-note"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              placeholder="e.g. Customer changed mind"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelOrder.isPending}>
              {cancelOrder.isPending ? 'Cancelling…' : 'Cancel order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove item confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from the order and recompute the subtotal + total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeItem.isPending}>Keep item</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveItem}
              disabled={removeItem.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeItem.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rating link dialog */}
      {order.status === 'delivered' && (
        <RatingLinkDialog
          orderId={orderId}
          orderCode={order.orderCode}
          customerPhone={order.customerPhone}
          open={ratingLinkOpen}
          onOpenChange={setRatingLinkOpen}
        />
      )}
    </div>
  );
}
