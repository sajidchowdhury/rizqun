import type { Request, Response } from 'express';
import { createUserSchema, updateUserSchema, listUsersQuerySchema } from './users.dto';
import { listUsers, createUser, updateUser, deleteUser } from './users.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /users ───────────────────────────────────────────────
export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const result = await listUsers(parsed.data);
  sendSuccess(res, result, 'Users retrieved');
}

// ─── POST /users ──────────────────────────────────────────────
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const user = await createUser(parsed.data);
  sendSuccess(res, { user }, 'User created', 201);
}

// ─── PATCH /users/:id ─────────────────────────────────────────
export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid user id');
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const callerId = req.user?.userId;
  if (!callerId) {
    throw new AppError(401, 'Not authenticated');
  }

  const user = await updateUser(id, parsed.data, callerId);
  sendSuccess(res, { user }, 'User updated');
}

// ─── DELETE /users/:id (soft delete) ──────────────────────────
export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid user id');
  }

  const callerId = req.user?.userId;
  if (!callerId) {
    throw new AppError(401, 'Not authenticated');
  }

  const result = await deleteUser(id, callerId);
  sendSuccess(res, { user: result }, 'User deactivated');
}
