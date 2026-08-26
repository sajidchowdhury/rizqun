import { Router } from 'express';
import { getSummary } from './dashboard.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// GET /dashboard/summary?month=2026-08
router.get('/summary', asyncHandler(getSummary));

export default router;
