import { Router } from 'express';
import { finalize, list, getOne } from './orders.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// POST /orders — finalize the cart into a saved order
router.post('/', asyncHandler(finalize));

// GET /orders — paginated list scoped by role
router.get('/', asyncHandler(list));

// GET /orders/:id — full order detail (with items + vendors)
router.get('/:id', asyncHandler(getOne));

export default router;
