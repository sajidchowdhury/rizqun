import type { Request, Response } from 'express';
import { listVendorsQuerySchema, createVendorSchema, updateVendorSchema } from './vendors.dto';
import {
  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
} from './vendors.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── GET /vendors ──────────────────────────────────────────────
export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listVendorsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const result = await listVendors(parsed.data);
  sendSuccess(res, result, 'Vendors retrieved');
}

// ─── GET /vendors/:id ─────────────────────────────────────────
export async function getOne(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid vendor id');
  }

  const vendor = await getVendorById(id);
  sendSuccess(res, { vendor }, 'Vendor retrieved');
}

// ─── POST /vendors ────────────────────────────────────────────
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createVendorSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const vendor = await createVendor(parsed.data);
  sendSuccess(res, { vendor }, 'Vendor created', 201);
}

// ─── PATCH /vendors/:id ───────────────────────────────────────
export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid vendor id');
  }

  const parsed = updateVendorSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const vendor = await updateVendor(id, parsed.data);
  sendSuccess(res, { vendor }, 'Vendor updated');
}

// ─── DELETE /vendors/:id (soft delete) ────────────────────────
export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (Number.isNaN(id) || id <= 0) {
    throw new AppError(400, 'Invalid vendor id');
  }

  const result = await deleteVendor(id);
  sendSuccess(res, { vendor: result }, 'Vendor deactivated');
}
