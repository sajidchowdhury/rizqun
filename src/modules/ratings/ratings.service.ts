import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import type { RatingFormData, SubmitRatingInput, SubmittedRating } from './ratings.dto';

// ─── Get rating form data (public) ────────────────────────────
//
// Looks up an order by its ratingToken and returns minimal info for the form.
// 404 if token doesn't exist (or was already consumed — token is NULL after
// submission).

export async function getRatingFormData(token: string): Promise<RatingFormData> {
  const order = await prisma.order.findFirst({
    where: { ratingToken: token },
    select: {
      orderCode: true,
      customerName: true,
      status: true,
    },
  });

  if (!order) {
    throw new AppError(404, 'Rating link not found or has already been used');
  }

  // Defensive — should never happen since token is only set for delivered orders,
  // but if somehow the token was set before delivery, block it
  if (order.status !== 'delivered') {
    throw new AppError(404, 'Rating link not found or has already been used');
  }

  return {
    orderCode: order.orderCode,
    customerName: order.customerName,
  };
}

// ─── Submit rating (public) ───────────────────────────────────
//
// Validates the token, checks for duplicate submissions, then atomically:
//   1. Inserts the rating row
//   2. Clears order.ratingToken to NULL (single-use)
//
// Returns the created rating with the order code for confirmation.

export async function submitRating(input: SubmitRatingInput): Promise<SubmittedRating> {
  // 1. Look up the order by token
  const order = await prisma.order.findFirst({
    where: { ratingToken: input.token },
    select: {
      id: true,
      orderCode: true,
      status: true,
    },
  });

  if (!order) {
    throw new AppError(404, 'Rating link not found or has already been used');
  }

  if (order.status !== 'delivered') {
    throw new AppError(404, 'Rating link not found or has already been used');
  }

  // 2. Check for existing rating (defensive — token uniqueness should prevent this,
  //    but if somehow the token wasn't cleared, we don't want duplicate ratings)
  const existingRating = await prisma.rating.findUnique({
    where: { orderId: order.id },
    select: { id: true },
  });

  if (existingRating) {
    throw new AppError(409, 'A rating has already been submitted for this order');
  }

  // 3. Transaction: insert rating + clear token
  const rating = await prisma.$transaction(async (tx) => {
    const newRating = await tx.rating.create({
      data: {
        orderId: order.id,
        overall: input.overall,
        speed: input.speed,
        behavior: input.behavior,
        comment: input.comment ?? null,
      },
    });

    // Clear the token so the URL can't be reused
    await tx.order.update({
      where: { id: order.id },
      data: { ratingToken: null },
    });

    return newRating;
  });

  return {
    orderId: order.id,
    orderCode: order.orderCode,
    overall: rating.overall,
    speed: rating.speed,
    behavior: rating.behavior,
    comment: rating.comment,
    submittedAt: rating.submittedAt,
  };
}
