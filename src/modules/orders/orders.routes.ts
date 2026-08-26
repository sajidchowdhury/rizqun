import { Router } from 'express';
import { finalize } from './orders.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// POST /orders — finalize the cart into a saved order
router.post('/', asyncHandler(finalize));

export default router;
