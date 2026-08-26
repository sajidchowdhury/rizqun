import { Router } from 'express';
import {
  finalize,
  list,
  getOne,
  updateStatus,
  listPending,
  cancel,
  getVendorGroups,
  update,
  addItem,
  removeItem,
  getAuditLog,
  listDone,
  generateRatingLinkHandler,
} from './orders.controller';
import { getForm as getRatingForm } from '../ratings/ratings.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// PUBLIC route — no auth required (customer rating form)
// Must be declared BEFORE router.use(authenticate)
router.get('/rating-form/:token', asyncHandler(getRatingForm));

// All other order routes require authentication
router.use(authenticate);

// POST /orders — finalize the cart into a saved order
router.post('/', asyncHandler(finalize));

// GET /orders — paginated list scoped by role
router.get('/', asyncHandler(list));

// IMPORTANT: static sub-paths (/pending, /done) must come BEFORE /:id so Express
// doesn't treat them as an order id.
router.get('/pending', asyncHandler(listPending));
router.get('/done', asyncHandler(listDone));

// PATCH /orders/:id/status — update status (more specific path declared first)
router.patch('/:id/status', asyncHandler(updateStatus));

// PATCH /orders/:id — update customer info / deliveryFee (general)
router.patch('/:id', asyncHandler(update));

// POST /orders/:id/items — add item to pending order (addedAfterFinalize=true)
router.post('/:id/items', asyncHandler(addItem));

// DELETE /orders/:id/items/:itemId — remove item from pending order
router.delete('/:id/items/:itemId', asyncHandler(removeItem));

// GET /orders/:id/vendor-groups — items grouped by vendor + copy text + wa.me URL
router.get('/:id/vendor-groups', asyncHandler(getVendorGroups));

// GET /orders/:id/audit-log — append-only status_log entries (oldest-first)
router.get('/:id/audit-log', asyncHandler(getAuditLog));

// POST /orders/:id/rating-link — generate rating URL for delivered order
router.post('/:id/rating-link', asyncHandler(generateRatingLinkHandler));

// DELETE /orders/:id — cancel (soft-delete) an order
router.delete('/:id', asyncHandler(cancel));

// GET /orders/:id — full order detail (with items + vendors)
router.get('/:id', asyncHandler(getOne));

export default router;
