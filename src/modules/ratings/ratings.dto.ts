import { z } from 'zod';

// ─── Rating form data (GET /orders/rating-form/:token) ────────
// Public endpoint — no auth required.
// Returns minimal order info so the customer can see which order they're rating.
// No sensitive data (no phone, address, totals, etc.).

export interface RatingFormData {
  orderCode: string;
  customerName: string;
}

// ─── Submit rating (POST /ratings) ────────────────────────────
// Public endpoint — no auth required.
// Body includes the token (from the URL), the 3 rating scores (1-5), and an
// optional comment.
//
// After submission:
//   1. The rating row is inserted
//   2. The order's ratingToken is cleared to NULL (single-use — URL stops working)
//   3. A second submission with the same token → 404 (token no longer exists)

export const submitRatingSchema = z.strictObject({
  token: z.string().trim().min(1, 'Token is required').max(64),
  overall: z.number().int().min(1, 'overall must be 1-5').max(5, 'overall must be 1-5'),
  speed: z.number().int().min(1, 'speed must be 1-5').max(5, 'speed must be 1-5'),
  behavior: z.number().int().min(1, 'behavior must be 1-5').max(5, 'behavior must be 1-5'),
  comment: z.string().trim().max(2000, 'Comment too long (max 2000 chars)').optional(),
});

export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;

export interface SubmittedRating {
  orderId: number;
  orderCode: string;
  overall: number;
  speed: number;
  behavior: number;
  comment: string | null;
  submittedAt: Date;
}
