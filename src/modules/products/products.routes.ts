import { Router } from 'express';
import {
  list,
  getOne,
  create,
  update,
  remove,
  search,
  quickAdd,
  recommendations,
  essentials,
  bulkUpdatePricesHandler,
  setVendorPriceHandler,
  priceHistory,
} from './products.controller';
import { importUpload, importHandler } from './import.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { categoryScope } from '../../middlewares/category-scope.middleware';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// IMPORTANT: static routes (/search, /quick-add, /essentials,
// /bulk-update-prices, /import) must come BEFORE /:id so Express
// doesn't treat them as a product id.
router.get('/search', categoryScope, asyncHandler(search));
router.post('/quick-add', asyncHandler(quickAdd));
router.get('/essentials', asyncHandler(essentials));
// Morning vendor-call workflow — any authenticated user can bulk-update prices.
router.post('/bulk-update-prices', asyncHandler(bulkUpdatePricesHandler));
// Bulk import (Excel/CSV upload) — super_admin only.
// multer middleware parses the multipart form data before our handler runs.
router.post('/import', requireRole('super_admin'), importUpload, asyncHandler(importHandler));

// Read access — any authed user
// `categoryScope` filters products by the user's categoryAccess so
// operators see only products in their allowed categories. Super
// admins / users with ['all'] see everything.
router.get('/', categoryScope, asyncHandler(list));
router.get('/:id', asyncHandler(getOne));
router.get('/:id/recommendations', asyncHandler(recommendations));
router.get('/:id/price-history', asyncHandler(priceHistory));

// Write access — super_admin only
router.post('/', requireRole('super_admin'), asyncHandler(create));
router.patch('/:id', requireRole('super_admin'), asyncHandler(update));
router.delete('/:id', requireRole('super_admin'), asyncHandler(remove));
// Per-vendor purchase price — super_admin only (Phase 4 prep)
router.post('/:id/vendor-price', requireRole('super_admin'), asyncHandler(setVendorPriceHandler));

export default router;
