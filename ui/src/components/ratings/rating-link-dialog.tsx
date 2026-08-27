import { useState } from 'react';
import { Check, Copy, ExternalLink, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useGenerateRatingLink } from '@/hooks/use-ratings';
import { toast } from '@/lib/toast';

interface RatingLinkDialogProps {
  orderId: number;
  orderCode: string;
  customerPhone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RatingLinkDialog({
  orderId,
  orderCode,
  customerPhone,
  open,
  onOpenChange,
}: RatingLinkDialogProps) {
  const generateLink = useGenerateRatingLink();
  const [copied, setCopied] = useState(false);

  // Generate the link when the dialog opens
  function handleGenerate() {
    generateLink.mutate(orderId);
  }

  // Auto-generate when dialog opens (only once)
  // Using a flag to avoid re-generating on every render
  const [hasGenerated, setHasGenerated] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next && !hasGenerated) {
      setHasGenerated(true);
      generateLink.mutate(orderId);
    }
    if (!next) {
      setCopied(false);
      setHasGenerated(false);
    }
    onOpenChange(next);
  }

  function handleCopy() {
    if (!generateLink.data) return;
    navigator.clipboard
      .writeText(generateLink.data.url)
      .then(() => {
        setCopied(true);
        toast.success('Link copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error('Failed to copy'));
  }

  function handleWhatsApp() {
    if (!generateLink.data) return;
    // Build a wa.me link to the customer's phone with the rating URL as the message
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Thank you for your order ${orderCode}! Please rate our service: ${generateLink.data.url}`,
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-5" />
            Rating link — {orderCode}
          </DialogTitle>
          <DialogDescription>
            Send this link to the customer so they can rate the service. The link is unique to this
            order and can only be used once.
          </DialogDescription>
        </DialogHeader>

        {generateLink.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-32" />
          </div>
        ) : generateLink.data ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Rating URL</label>
              <Input readOnly value={generateLink.data.url} className="font-mono text-xs" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
                {copied ? (
                  <>
                    <Check className="size-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copy link
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleWhatsApp} className="flex-1">
                <ExternalLink className="size-4" />
                Send via WhatsApp
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Click the button below to generate a rating link for this order.
            </p>
            <Button onClick={handleGenerate} className="w-full">
              <Star className="size-4" />
              Generate rating link
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
