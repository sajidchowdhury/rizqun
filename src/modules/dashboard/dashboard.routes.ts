import { Router } from 'express';
import {
  getSummary,
  getOrdersPerDayHandler,
  getAvgTimePerDayHandler,
  getCategoryBreakdownHandler,
} from './dashboard.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// GET /dashboard/summary?month=2026-08
router.get('/summary', asyncHandler(getSummary));

// GET /dashboard/orders-per-day?days=30
router.get('/orders-per-day', asyncHandler(getOrdersPerDayHandler));

// GET /dashboard/avg-time-per-day?days=30
router.get('/avg-time-per-day', asyncHandler(getAvgTimePerDayHandler));

// GET /dashboard/category-breakdown?month=2026-08
router.get('/category-breakdown', asyncHandler(getCategoryBreakdownHandler));

export default router;
