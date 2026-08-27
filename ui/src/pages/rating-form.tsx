import { useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useRatingForm, useSubmitRating } from '@/hooks/use-ratings';
import { StarRating } from '@/components/ratings/star-rating';

export function RatingFormPage() {
  // Extract the token from the URL path (the route is /rating/:token)
  const pathParts = window.location.pathname.split('/');
  const token = pathParts[pathParts.length - 1] || '';

  const { data: formData, isLoading, isError } = useRatingForm(token);
  const submitRating = useSubmitRating();

  const [overall, setOverall] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [behavior, setBehavior] = useState(0);
  const [comment, setComment] = useState('');

  const canSubmit = overall > 0 && speed > 0 && behavior > 0 && !submitRating.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    submitRating.mutate(
      {
        token,
        overall,
        speed,
        behavior,
        comment: comment.trim() || undefined,
      },
      {
        onSuccess: () => {
          // Reset form after success
          setOverall(0);
          setSpeed(0);
          setBehavior(0);
          setComment('');
        },
      },
    );
  }

  // ─── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Invalid/expired token ─────────────────────────────────────
  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-3 pt-6">
            <Star className="mx-auto size-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">Invalid or expired link</h2>
            <p className="text-sm text-muted-foreground">
              This rating link is no longer valid. It may have already been used or the order may
              not exist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Already submitted ─────────────────────────────────────────
  if (submitRating.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-3 pt-6">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <h2 className="text-lg font-semibold">Thank you for your rating!</h2>
            <p className="text-sm text-muted-foreground">
              Your feedback has been submitted for order {submitRating.data?.orderCode}. We
              appreciate your time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Rating form ───────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Star className="mx-auto mb-2 size-10 fill-amber-400 text-amber-400" />
          <CardTitle className="text-xl">Rate your order</CardTitle>
          <p className="text-sm text-muted-foreground">
            Order <span className="font-mono font-medium">{formData?.orderCode}</span>
            {formData?.customerName && ` · ${formData.customerName}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-2">
            <StarRating
              value={overall}
              onChange={setOverall}
              size="lg"
              label="Overall experience"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2">
              <StarRating value={speed} onChange={setSpeed} size="md" label="Delivery speed" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <StarRating
                value={behavior}
                onChange={setBehavior}
                size="md"
                label="Service behavior"
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Input
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us more about your experience…"
              maxLength={2000}
            />
          </div>

          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full" size="lg">
            {submitRating.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit rating'
            )}
          </Button>

          {!canSubmit && !submitRating.isPending && (
            <p className="text-center text-xs text-muted-foreground">
              Please rate all three categories to submit.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
