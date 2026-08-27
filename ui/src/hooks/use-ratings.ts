import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type {
  RatingLinkResponse,
  RatingFormResponse,
  SubmittedRating,
  SubmitRatingPayload,
} from '@/types/rating';

// ─── Generate rating link (POST /orders/:id/rating-link) ──────

export function useGenerateRatingLink() {
  return useMutation({
    mutationFn: async (orderId: number) => {
      return (await api.post<RatingLinkResponse>(
        `/orders/${orderId}/rating-link`,
      )) as RatingLinkResponse;
    },
    onSuccess: () => {
      toast.success('Rating link generated');
    },
    onError: (error) => toast.apiError(error),
  });
}

// ─── Get rating form data (GET /orders/rating-form/:token) ────
// Public — no auth required.

export function useRatingForm(token: string) {
  return useQuery({
    queryKey: ['rating-form', token] as const,
    queryFn: async () => {
      return (await api.get<RatingFormResponse>(
        `/orders/rating-form/${token}`,
      )) as RatingFormResponse;
    },
    enabled: token.length > 0,
    retry: false, // Don't retry — 404 means invalid token
  });
}

// ─── Submit rating (POST /ratings) ─────────────────────────────
// Public — no auth required.

export function useSubmitRating() {
  return useMutation({
    mutationFn: async (payload: SubmitRatingPayload) => {
      return (await api.post<SubmittedRating>('/ratings', payload)) as SubmittedRating;
    },
    onError: (error) => toast.apiError(error),
  });
}
