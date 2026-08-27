import { Router } from 'express';
import { list, getOne, create, update, remove } from './vendors.controller';
import { vendorProducts } from '../products/products.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';

const router = Router();

// All vendor routes require authentication
router.use(authenticate);

// Read access — any authed user can list/get vendors
router.get('/', asyncHandler(list));
router.get('/:id', asyncHandler(getOne));
// Vendor's full catalog (for the morning price-update UI). Returns the
// products this vendor supplies (either as default vendor or via
// ProductVendor) with the vendor's per-vendor purchasePrice included.
router.get('/:id/products', asyncHandler(vendorProducts));

// Write access — super_admin only
router.post('/', requireRole('super_admin'), asyncHandler(create));
router.patch('/:id', requireRole('super_admin'), asyncHandler(update));
router.delete('/:id', requireRole('super_admin'), asyncHandler(remove));

export default router;
