import rateLimit from 'express-rate-limit';

// ─── Rate limiter configs ──────────────────────────────────────
//
// Centralized so all limiters are in one place and easy to tune.
//
// Three limiters:
//   1. loginLimiter — strict (5/15min) on POST /auth/login
//      Prevents brute-force password guessing
//   2. generalApiLimiter — moderate (100/min) on all /api routes
//      Prevents API abuse (scraping, DoS)
//   3. ratingLimiter — already configured in ratings.routes.ts (5/hour)
//
// All use standardHeaders: true so clients see RateLimit-* headers
// and can back off gracefully.

// 1. Login rate limiter — 5 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
  },
});

// 2. General API rate limiter — 100 requests per minute per IP
// Applied globally (after /health and /orders/rating-form which are public).
// Uses a generous limit so legitimate single-operator usage never hits it.
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down.',
  },
  // Skip rate limiting for health checks (we want /health to always respond
  // so monitoring tools don't false-alarm)
  skip: (req) => req.path === '/health',
});
