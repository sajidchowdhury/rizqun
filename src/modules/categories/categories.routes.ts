import { Router } from 'express';
import { list, create, update, remove } from './categories.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';

const router = Router();

// All category routes require authentication
router.use(authenticate);

// GET /categories — any authed user can list categories
router.get('/', asyncHandler(list));

// Write access — super_admin only
router.post('/', requireRole('super_admin'), asyncHandler(create));
router.patch('/:id', requireRole('super_admin'), asyncHandler(update));
router.delete('/:id', requireRole('super_admin'), asyncHandler(remove));

export default router;
