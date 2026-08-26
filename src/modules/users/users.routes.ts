import { Router } from 'express';
import { list, create, update, remove } from './users.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';

const router = Router();

// All user routes require authentication + super_admin role
router.use(authenticate, requireRole('super_admin'));

// GET /users — list all users (paginated, filterable)
router.get('/', asyncHandler(list));

// POST /users — create a new user
router.post('/', asyncHandler(create));

// PATCH /users/:id — update a user (partial)
router.patch('/:id', asyncHandler(update));

// DELETE /users/:id — soft-delete (deactivate)
router.delete('/:id', asyncHandler(remove));

export default router;
