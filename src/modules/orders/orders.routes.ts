import { Router } from 'express';
import {
  finalize,
  list,
  getOne,
  updateStatus,
  listPending,
  cancel,
  getVendorGroups,
} from './orders.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// POST /orders — finalize the cart into a saved order
router.post('/', asyncHandler(finalize));

// GET /orders — paginated list scoped by role
router.get('/', asyncHandler(list));

// IMPORTANT: static sub-paths (/pending) must come BEFORE /:id so Express
// doesn't treat "pending" as an order id.
router.get('/pending', asyncHandler(listPending));

// PATCH /orders/:id/status — update status
router.patch('/:id/status', asyncHandler(updateStatus));

// GET /orders/:id/vendor-groups — items grouped by vendor + copy text + wa.me URL
router.get('/:id/vendor-groups', asyncHandler(getVendorGroups));

// DELETE /orders/:id — cancel (soft-delete) an order
router.delete('/:id', asyncHandler(cancel));

// GET /orders/:id — full order detail (with items + vendors)
router.get('/:id', asyncHandler(getOne));

export default router;
