import type { Request, Response } from 'express';
import multer from 'multer';

import { importProducts, type ImportFormat } from './import.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

// ─── Multer config ─────────────────────────────────────────────
//
// Store the uploaded file in memory (not on disk) — we parse it
// immediately and don't need to keep it around. 10MB max to prevent
// abuse (a typical Excel product file is 50-500KB).

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx?|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only .xlsx, .xls, or .csv files are allowed'));
    }
  },
});

// Export the multer middleware for the route to use
export const importUpload = upload.single('file');

// ─── POST /products/import ────────────────────────────────────
//
// Upload an Excel/CSV file for bulk product import.
//
// Body (multipart/form-data):
//   - file: the Excel/CSV file
//   - section: 'grocery' | 'medicine' | 'auto' (query param or form field)
//   - groupName: optional override (form field)
//   - categoryName: optional override (form field)
//   - dryRun: 'true' for preview, 'false' for actual import (form field)
//
// Returns:
//   - dryRun=true: ImportPreview (parsed data + duplicate detection)
//   - dryRun=false: ImportResult (import stats)

export async function importHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new AppError(400, 'No file uploaded. Attach a file to the "file" field.');
  }

  const section = (req.body.section ?? 'auto') as ImportFormat;
  const groupName = req.body.groupName || undefined;
  const categoryName = req.body.categoryName || undefined;
  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;

  const result = await importProducts({
    fileBuffer: req.file.buffer,
    originalName: req.file.originalname,
    section,
    groupName,
    categoryName,
    dryRun,
  });

  if (dryRun) {
    sendSuccess(res, result, `Preview: ${(result as { newProducts: number }).newProducts} new, ${(result as { duplicates: number }).duplicates} duplicates`);
  } else {
    const r = result as { imported: number; skippedDuplicates: number };
    sendSuccess(res, result, `Imported ${r.imported} products, skipped ${r.skippedDuplicates} duplicates`);
  }
}
