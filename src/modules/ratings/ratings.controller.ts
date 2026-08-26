import type { Request, Response } from 'express';
import { submitRatingSchema } from './ratings.dto';
import { getRatingFormData, submitRating } from './ratings.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /orders/rating-form/:token ───────────────────────────
// Public — no auth required.
// Returns minimal order info so the customer can see which order they're rating.
export async function getForm(req: Request, res: Response): Promise<void> {
  const token = req.params.token;
  if (!token || token.length < 1) {
    throw new AppError(400, 'Token is required');
  }

  const formData = await getRatingFormData(token);
  sendSuccess(res, formData, 'Rating form data');
}

// ─── POST /ratings ────────────────────────────────────────────
// Public — no auth required.
// Rate-limited to 5 requests per hour per IP (configured in routes).
export async function submit(req: Request, res: Response): Promise<void> {
  const parsed = submitRatingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const rating = await submitRating(parsed.data);
  sendSuccess(res, rating, 'Rating submitted successfully', 201);
}
