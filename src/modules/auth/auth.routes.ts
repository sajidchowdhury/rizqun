import { Router } from 'express';
import { register, login, refresh, logout, me } from './auth.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// Public routes
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/refresh', asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));

// Will be protected by `authenticate` middleware in Session 1.3
router.get('/me', asyncHandler(me));

export default router;
