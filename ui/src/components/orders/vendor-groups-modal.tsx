import { useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  MessageCircle,
  Package,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOrderVendorGroups, useChangeItemVendor } from '@/hooks/use-orders';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import { formatBDT } from '@/contexts/cart-store';
import type { VendorGroupItem } from '@/types/order';

interface VendorGroupsModalProps {
  orderId: number;
  orderCode: string;
  orderStatus?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorGroupsModal({
  orderId,
  orderCode,
  orderStatus,
  open,
  onOpenChange,
}: VendorGroupsModalProps) {
  const { data, isLoading } = useOrderVendorGroups(orderId, open);
  const [copiedVendorId, setCopiedVendorId] = useState<number | null>(null);

  function handleCopy(vendorId: number, text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedVendorId(vendorId);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopiedVendorId(null), 2000);
      })
      .catch(() => toast.error('Failed to copy'));
  }

  // Order is editable if status is pending / waiting_vendor / preparing.
  // Only in that state can the operator manually override the vendor.
  const isEditable =
    !orderStatus || ['pending', 'waiting_vendor', 'preparing'].includes(orderStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Vendor groups — {orderCode}
          </DialogTitle>
          <DialogDescription>
            Items grouped by vendor with profit margins. Copy each vendor's text and send via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : data && data.groups.length > 0 ? (
          <div className="space-y-4">
            {data.groups.map((group) => (
              <div
                key={group.vendorId}
                className={cn(
                  'rounded-lg border p-4',
                  group.isRecommended && 'border-commerce/60 ring-1 ring-commerce/20',
                )}
              >
                {/* Vendor header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{group.vendorName}</span>
                      {group.isRecommended && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-commerce px-2 py-0.5 text-[10px] font-semibold text-commerce-foreground">
                          <Sparkles className="size-3" />
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {group.vendorPhone}
                      {group.vendorWhatsappNumber && ` · WhatsApp: ${group.vendorWhatsappNumber}`}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline">{group.items.length} items</Badge>
                    <span className="flex items-center gap-1 text-xs font-medium text-commerce">
                      <TrendingUp className="size-3" />
                      {formatBDT(Number(group.totalMargin))} margin
                    </span>
                  </div>
                </div>

                {/* Items list */}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      orderId={orderId}
                      isEditable={isEditable}
                    />
                  ))}
                </div>

                <Separator className="my-2" />

                {/* Subtotal + margin */}
                <div className="mb-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Subtotal</span>
                    <span className="font-mono text-sm font-medium">
                      {formatBDT(Number(group.subtotal))}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Profit margin</span>
                    <span className="font-mono font-medium text-commerce">
                      {formatBDT(Number(group.totalMargin))}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(group.vendorId, group.copyText)}
                  >
                    {copiedVendorId === group.vendorId ? (
                      <>
                        <Check className="size-4" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" /> Copy text
                      </>
                    )}
                  </Button>
                  {group.whatsappUrl && (
                    <Button
                      size="sm"
                      onClick={() => window.open(group.whatsappUrl ?? undefined, '_blank')}
                    >
                      <MessageCircle className="size-4" />
                      Open WhatsApp
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No vendor groups available.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Item row (with vendor override dropdown) ─────────────────

function ItemRow({
  item,
  orderId,
  isEditable,
}: {
  item: VendorGroupItem;
  orderId: number;
  isEditable: boolean;
}) {
  const changeVendor = useChangeItemVendor();
  const [changing, setChanging] = useState(false);

  // The reason badge — shows why this vendor was chosen
  const reasonLabel: Record<string, string> = {
    auto: 'Auto',
    manual: 'Manual',
    preferred: 'Preferred',
    'only-vendor': 'Only vendor',
    'default-vendor': 'Default',
  };
  const reasonBadge = item.vendorChoiceReason
    ? reasonLabel[item.vendorChoiceReason] ?? item.vendorChoiceReason
    : null;

  function handleVendorChange(vendorId: string) {
    const newVendorId = Number(vendorId);
    if (Number.isNaN(newVendorId) || newVendorId <= 0) return; // no-op
    setChanging(true);
    changeVendor.mutate(
      { orderId, itemId: item.id, vendorId: newVendorId },
      {
        onSettled: () => setChanging(false),
      },
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 py-1 text-sm">
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {item.addedAfterFinalize && (
            <Badge variant="secondary" className="text-[10px]">
              NEW
            </Badge>
          )}
          <span className="font-medium">{item.productNameSnapshot}</span>
          <span className="text-muted-foreground">× {item.qty}</span>
          {item.unit && (
            <span className="text-xs text-muted-foreground">{item.unit}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {reasonBadge && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {reasonBadge}
            </span>
          )}
          <span>
            Margin: <span className="font-mono text-commerce">{formatBDT(Number(item.lineMargin))}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-sm">{formatBDT(Number(item.lineTotal))}</span>
        {/* Vendor override dropdown — only shown if there are alternatives
            AND the order is still editable. Locked orders can't change vendors. */}
        {isEditable && item.alternatives.length > 0 && (
          <Select
            value=""
            onValueChange={handleVendorChange}
            disabled={changing}
          >
            <SelectTrigger className="h-6 w-[130px] rounded-full px-2 text-[10px]">
              {changing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <>
                  <ChevronDown className="size-3" />
                  <SelectValue placeholder="Switch vendor" />
                </>
              )}
            </SelectTrigger>
            <SelectContent>
              {item.alternatives.map((alt) => (
                <SelectItem key={alt.vendorId} value={String(alt.vendorId)}>
                  <span className="flex items-center gap-1.5">
                    {alt.vendorName}
                    {alt.isPreferred && (
                      <span className="rounded-full bg-commerce-soft px-1 text-[9px] text-commerce-soft-foreground">
                        preferred
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      ৳{alt.margin}/u
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
