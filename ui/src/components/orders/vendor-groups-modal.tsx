import { useState } from 'react';
import { Check, Copy, MessageCircle, Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOrderVendorGroups } from '@/hooks/use-orders';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import { formatBDT } from '@/contexts/cart-store';

interface VendorGroupsModalProps {
  orderId: number;
  orderCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorGroupsModal({
  orderId,
  orderCode,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Vendor groups — {orderCode}
          </DialogTitle>
          <DialogDescription>
            Items grouped by vendor. Copy each vendor's text and send via WhatsApp.
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
              <div key={group.vendorId} className="rounded-lg border p-4">
                {/* Vendor header */}
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{group.vendorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {group.vendorPhone}
                      {group.vendorWhatsappNumber && ` · WhatsApp: ${group.vendorWhatsappNumber}`}
                    </div>
                  </div>
                  <Badge variant="outline">{group.items.length} items</Badge>
                </div>

                {/* Items list */}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {item.addedAfterFinalize && (
                          <Badge variant="secondary" className="text-[10px]">
                            NEW
                          </Badge>
                        )}
                        <span className="font-medium">{item.productNameSnapshot}</span>
                        <span className="text-muted-foreground">× {item.qty}</span>
                        <span className="text-xs text-muted-foreground">{item.unit}</span>
                      </div>
                      <span className="font-mono text-sm">{formatBDT(Number(item.lineTotal))}</span>
                    </div>
                  ))}
                </div>

                <Separator className="my-2" />

                {/* Subtotal */}
                <div className="mb-3 flex justify-between">
                  <span className="text-sm font-medium">Subtotal</span>
                  <span className="font-mono text-sm font-medium">
                    {formatBDT(Number(group.subtotal))}
                  </span>
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
                    <Button size="sm" onClick={() => window.open(group.whatsappUrl!, '_blank')}>
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
