import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getForm, submit } from './ratings.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// Rate limiter for POST /ratings — 5 requests per hour per IP.
// Prevents spamming the rating endpoint.
// (Session 10.1 will add rate limiting to other endpoints too)
const ratingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many rating submissions from this IP. Please try again later.',
  },
});

// GET /orders/rating-form/:token — public (no auth)
router.get('/rating-form/:token', asyncHandler(getForm));

// POST /ratings — public (no auth), rate-limited
router.post('/', ratingLimiter, asyncHandler(submit));

export default router;
