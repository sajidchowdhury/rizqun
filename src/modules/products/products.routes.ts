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
} from './products.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { categoryScope } from '../../middlewares/category-scope.middleware';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// IMPORTANT: static routes (/search, /quick-add, /essentials) must come
// BEFORE /:id so Express doesn't treat them as a product id.
router.get('/search', categoryScope, asyncHandler(search));
router.post('/quick-add', asyncHandler(quickAdd));
router.get('/essentials', asyncHandler(essentials));

// Read access — any authed user
router.get('/', asyncHandler(list));
router.get('/:id', asyncHandler(getOne));
router.get('/:id/recommendations', asyncHandler(recommendations));

// Write access — super_admin only
router.post('/', requireRole('super_admin'), asyncHandler(create));
router.patch('/:id', requireRole('super_admin'), asyncHandler(update));
router.delete('/:id', requireRole('super_admin'), asyncHandler(remove));

export default router;
