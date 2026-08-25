import { Router } from 'express';
import { list, getOne, create, update, remove } from './products.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// Read access — any authed user
router.get('/', asyncHandler(list));
router.get('/:id', asyncHandler(getOne));

// Write access — super_admin only
router.post('/', requireRole('super_admin'), asyncHandler(create));
router.patch('/:id', requireRole('super_admin'), asyncHandler(update));
router.delete('/:id', requireRole('super_admin'), asyncHandler(remove));

export default router;
