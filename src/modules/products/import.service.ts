// ─── Product import service (smart Excel/CSV uploader) ─────────
//
// Handles two Excel formats:
//
// 1. Grocery format (chaldal-style):
//    - Multiple sheets, each sheet name = a subcategory
//      (e.g. "Chocolates", "Wafers", "Candies")
//    - First sheet "Index" lists subcategories with product counts
//    - Each product sheet has columns:
//      #, Name, Brand, Unit / Weight, Price (Tk), Discounted Price (Tk),
//      Image URL, Product URL
//    - The section is "grocery", group = filename (e.g. "candy-chocolate"),
//      category = derived from the filename or a fixed value
//
// 2. Medicine format (Labaid-style):
//    - Single sheet with columns:
//      #SL, Name of the Manufacturer, Brand Name, Generic Name, Strength,
//      Dosage Description, Price, Use For, DAR
//    - The section is "medicine", manufacturer = vendor,
//      brand name = product name, generic name = genericName,
//      strength + dosage = unit, price = salePrice
//
// Duplicate detection:
//   - Case-insensitive, trimmed product name match against existing
//     active products. Duplicates are skipped (not re-imported).
//   - Within the same file, dedup by name too (if the same product
//     appears in two sheets, only the first occurrence is kept).
//
// Hierarchy auto-creation:
//   - Section: provided by the caller (grocery / medicine / other)
//   - Group: auto-created from a provided group name (or "General")
//   - Category: auto-created from the category name (or the sheet name
//     for grocery; "General Medicine" for medicine)
//   - SubCategory: auto-created from the subcategory name (sheet name
//     for grocery; the dosage description for medicine)
//
// Dry run mode:
//   - dryRun=true: parse + detect duplicates + return preview, no DB writes
//   - dryRun=false: actually import (create products, vendors, hierarchy)
//
// Endpoint: POST /products/import (multipart/form-data with file upload)

import { read, utils } from 'xlsx';
import { prisma } from '../../config/prisma';

// ─── Types ─────────────────────────────────────────────────────

export type ImportFormat = 'grocery' | 'medicine' | 'auto';

export interface ImportPreviewRow {
  rowNumber: number;
  name: string;
  brand: string | null;
  unit: string;
  salePrice: number;
  discountPrice: number | null;
  imageUrl: string | null;
  genericName: string | null;
  categoryName: string;
  subCategoryName: string | null;
  vendorName: string | null;
  isDuplicate: boolean;
  // For duplicates: the existing product's id (for reference)
  existingProductId?: number;
}

export interface ImportPreview {
  format: 'grocery' | 'medicine';
  totalRows: number;
  newProducts: number;
  duplicates: number;
  errors: number;
  // The full preview (limited to 200 rows for the response — large
  // files would be too big to send over the wire)
  rows: ImportPreviewRow[];
  // Summary by category
  categories: Array<{ name: string; count: number; duplicates: number }>;
  // Summary by vendor (for medicine imports)
  vendors: Array<{ name: string; count: number }>;
}

export interface ImportResult {
  format: 'grocery' | 'medicine';
  imported: number;
  skippedDuplicates: number;
  errors: number;
  categoriesCreated: number;
  subCategoriesCreated: number;
  vendorsCreated: number;
}

export interface ImportInput {
  /** The file buffer (from multer) */
  fileBuffer: Buffer;
  /** Original filename — used to infer the group name for grocery imports */
  originalName: string;
  /** Override the section (grocery/medicine/other). If 'auto', we infer
   * from the filename/columns. */
  section: ImportFormat;
  /** Override the group name. If not provided, derived from the filename. */
  groupName?: string;
  /** Override the category name. If not provided, derived from the sheet
   * name (grocery) or "General Medicine" (medicine). */
  categoryName?: string;
  /** Dry run — parse + preview but don't write to the DB */
  dryRun: boolean;
}

// ─── Format detection ──────────────────────────────────────────

function detectFormat(wb: ReturnType<typeof read>): 'grocery' | 'medicine' {
  // Grocery format: multiple sheets, first sheet is "Index"
  if (wb.SheetNames.length > 1 && wb.SheetNames[0].toLowerCase() === 'index') {
    return 'grocery';
  }
  // Medicine format: check the first sheet's header row for medicine-specific columns
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(firstSheet, { header: 1, defval: null }) as unknown[][];
  if (rows.length > 0) {
    const header = (rows[0] as unknown[]).map((c) => String(c ?? '').toLowerCase());
    if (
      header.some((h) => h.includes('manufacturer')) ||
      header.some((h) => h.includes('generic name')) ||
      header.some((h) => h.includes('dosage'))
    ) {
      return 'medicine';
    }
  }
  // Default to grocery if we can't tell
  return 'grocery';
}

// ─── Parse grocery format ─────────────────────────────────────

interface ParsedGroceryRow {
  name: string;
  brand: string | null;
  unit: string;
  salePrice: number;
  discountPrice: number | null;
  imageUrl: string | null;
  categoryName: string;
  subCategoryName: string;
}

function parseGroceryFile(
  wb: ReturnType<typeof read>,
  fallbackCategory: string,
): ParsedGroceryRow[] {
  const rows: ParsedGroceryRow[] = [];

  for (const sheetName of wb.SheetNames) {
    // Skip the Index sheet
    if (sheetName.toLowerCase() === 'index') continue;

    const sheet = wb.Sheets[sheetName];
    const sheetRows = utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    if (sheetRows.length < 2) continue; // header + at least 1 data row

    // Detect column positions from the header row
    const header = (sheetRows[0] as unknown[]).map((c) => String(c ?? '').toLowerCase());
    const colName = header.findIndex((h) => h.includes('name') && !h.includes('brand'));
    const colBrand = header.findIndex((h) => h.includes('brand'));
    const colUnit = header.findIndex((h) => h.includes('unit') || h.includes('weight'));
    const colPrice = header.findIndex((h) => h.includes('price') && !h.includes('discount'));
    const colDiscount = header.findIndex((h) => h.includes('discount'));
    const colImage = header.findIndex((h) => h.includes('image'));

    if (colName === -1 || colPrice === -1) continue; // skip sheets without required columns

    for (let i = 1; i < sheetRows.length; i++) {
      const row = sheetRows[i] as unknown[];
      const name = String(row[colName] ?? '').trim();
      if (!name) continue;

      const priceStr = String(row[colPrice] ?? '').replace(/[^0-9.]/g, '');
      const price = parseFloat(priceStr) || 0;
      if (price === 0) continue; // skip rows with no price

      const discountStr = colDiscount >= 0 ? String(row[colDiscount] ?? '').replace(/[^0-9.]/g, '') : '';
      const discount = parseFloat(discountStr) || 0;
      const hasDiscount = discount > 0 && discount < price;

      rows.push({
        name,
        brand: colBrand >= 0 ? String(row[colBrand] ?? '').trim() || null : null,
        unit: colUnit >= 0 ? String(row[colUnit] ?? '').trim() || 'pcs' : 'pcs',
        salePrice: price,
        discountPrice: hasDiscount ? discount : null,
        imageUrl: colImage >= 0 ? String(row[colImage] ?? '').trim() || null : null,
        categoryName: fallbackCategory,
        subCategoryName: sheetName,
      });
    }
  }

  return rows;
}

// ─── Parse medicine format ────────────────────────────────────

interface ParsedMedicineRow {
  name: string;
  brand: string | null;
  genericName: string | null;
  unit: string;
  salePrice: number;
  vendorName: string;
  dosageDescription: string | null;
}

function parseMedicineFile(wb: ReturnType<typeof read>): ParsedMedicineRow[] {
  const rows: ParsedMedicineRow[] = [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const sheetRows = utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
  if (sheetRows.length < 2) return rows;

  const header = (sheetRows[0] as unknown[]).map((c) => String(c ?? '').toLowerCase());
  const colManufacturer = header.findIndex((h) => h.includes('manufacturer'));
  const colBrand = header.findIndex((h) => h.includes('brand name') || h === 'brand');
  const colGeneric = header.findIndex((h) => h.includes('generic'));
  const colStrength = header.findIndex((h) => h.includes('strength'));
  const colDosage = header.findIndex((h) => h.includes('dosage'));
  const colPrice = header.findIndex((h) => h.includes('price'));

  if (colBrand === -1 || colPrice === -1) return rows;

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i] as unknown[];
    const name = String(row[colBrand] ?? '').trim();
    if (!name) continue;

    const priceStr = String(row[colPrice] ?? '').replace(/[^0-9.]/g, '');
    const price = parseFloat(priceStr) || 0;
    if (price === 0) continue;

    const strength = colStrength >= 0 ? String(row[colStrength] ?? '').trim() : '';
    const dosage = colDosage >= 0 ? String(row[colDosage] ?? '').trim() : '';
    const unit = [strength, dosage].filter(Boolean).join(' ') || 'pcs';

    rows.push({
      name,
      brand: null, // medicine doesn't have a separate brand column
      genericName: colGeneric >= 0 ? String(row[colGeneric] ?? '').trim() || null : null,
      unit,
      salePrice: price,
      vendorName: colManufacturer >= 0 ? String(row[colManufacturer] ?? '').trim() || 'Unknown' : 'Unknown',
      dosageDescription: dosage || null,
    });
  }

  return rows;
}

// ─── Main import function ─────────────────────────────────────

export async function importProducts(input: ImportInput): Promise<ImportPreview | ImportResult> {
  // Parse the Excel file
  const wb = read(input.fileBuffer, { type: 'buffer' });

  // Detect or use the provided format
  const format = input.section === 'auto' ? detectFormat(wb) : input.section;

  // Determine the group name (from filename or provided)
  const groupName = input.groupName ?? deriveGroupName(input.originalName);

  // Determine the category name (from input or format default)
  const categoryName = input.categoryName ?? (format === 'medicine' ? 'General Medicine' : deriveCategoryName(input.originalName));

  // Parse the rows based on the format
  let parsedRows: Array<{
    name: string;
    brand: string | null;
    unit: string;
    salePrice: number;
    discountPrice: number | null;
    imageUrl: string | null;
    genericName: string | null;
    categoryName: string;
    subCategoryName: string | null;
    vendorName: string | null;
  }>;

  if (format === 'medicine') {
    const medRows = parseMedicineFile(wb);
    parsedRows = medRows.map((r) => ({
      name: r.name,
      brand: r.brand,
      unit: r.unit,
      salePrice: r.salePrice,
      discountPrice: null,
      imageUrl: null,
      genericName: r.genericName,
      categoryName,
      subCategoryName: r.dosageDescription,
      vendorName: r.vendorName,
    }));
  } else {
    const groceryRows = parseGroceryFile(wb, categoryName);
    parsedRows = groceryRows.map((r) => ({
      name: r.name,
      brand: r.brand,
      unit: r.unit,
      salePrice: r.salePrice,
      discountPrice: r.discountPrice,
      imageUrl: r.imageUrl,
      genericName: null,
      categoryName: r.categoryName,
      subCategoryName: r.subCategoryName,
      vendorName: null, // grocery imports don't have a vendor column
    }));
  }

  // ─── Duplicate detection ───────────────────────────────────
  // Load all existing active product names (case-insensitive) in one
  // query for fast dedup. We compare against the trimmed lowercase name.
  const existingNames = new Set<string>();
  const existingByName = new Map<string, number>();
  if (parsedRows.length > 0) {
    const existing = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    for (const p of existing) {
      const key = p.name.trim().toLowerCase();
      existingNames.add(key);
      existingByName.set(key, p.id);
    }
  }

  // Also dedup within the file (if the same name appears twice, only
  // the first occurrence is "new", the rest are "duplicates")
  const seenInFile = new Set<string>();

  // Build the preview rows
  const previewRows: ImportPreviewRow[] = [];
  let newCount = 0;
  let dupCount = 0;
  let errorCount = 0;
  const categoryStats = new Map<string, { count: number; duplicates: number }>();
  const vendorStats = new Map<string, number>();

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const key = row.name.trim().toLowerCase();

    const isDup = existingNames.has(key) || seenInFile.has(key);
    if (isDup) {
      dupCount++;
    } else {
      newCount++;
      seenInFile.add(key);
    }

    // Track errors (rows with invalid data)
    if (row.salePrice < 0) errorCount++;

    // Category stats
    const catStat = categoryStats.get(row.categoryName) ?? { count: 0, duplicates: 0 };
    catStat.count++;
    if (isDup) catStat.duplicates++;
    categoryStats.set(row.categoryName, catStat);

    // Vendor stats (medicine only)
    if (row.vendorName) {
      vendorStats.set(row.vendorName, (vendorStats.get(row.vendorName) ?? 0) + 1);
    }

    previewRows.push({
      rowNumber: i + 1,
      name: row.name,
      brand: row.brand,
      unit: row.unit,
      salePrice: row.salePrice,
      discountPrice: row.discountPrice,
      imageUrl: row.imageUrl,
      genericName: row.genericName,
      categoryName: row.categoryName,
      subCategoryName: row.subCategoryName,
      vendorName: row.vendorName,
      isDuplicate: isDup,
      existingProductId: isDup ? existingByName.get(key) : undefined,
    });
  }

  // ─── Dry run: return the preview ───────────────────────────
  if (input.dryRun) {
    const preview: ImportPreview = {
      format,
      totalRows: parsedRows.length,
      newProducts: newCount,
      duplicates: dupCount,
      errors: errorCount,
      rows: previewRows.slice(0, 200), // cap for response size
      categories: Array.from(categoryStats.entries()).map(([name, s]) => ({
        name,
        count: s.count,
        duplicates: s.duplicates,
      })),
      vendors: Array.from(vendorStats.entries()).map(([name, count]) => ({ name, count })),
    };
    return preview;
  }

  // ─── Execute: actually import ──────────────────────────────
  const sectionSlug = format === 'medicine' ? 'medicine' : 'grocery';
  const groupSlug = slugify(groupName);
  const categorySlug = slugify(categoryName);

  // Upsert the section
  const section = await prisma.section.upsert({
    where: { slug: sectionSlug },
    create: { slug: sectionSlug, name: capitalize(sectionSlug) },
    update: {},
  });

  // Upsert the group
  const group = await prisma.group.upsert({
    where: { slug: groupSlug },
    create: { slug: groupSlug, name: groupName, sectionId: section.id },
    update: {},
  });

  // Upsert the category
  const category = await prisma.category.upsert({
    where: { slug: categorySlug },
    create: { slug: categorySlug, name: categoryName, groupId: group.id },
    update: {},
  });

  let subCategoriesCreated = 0;
  let vendorsCreated = 0;

  // For medicine imports, create all vendors at once.
  // Vendor.name is not unique (the schema doesn't have a unique constraint
  // on name), so we can't use upsert — we use findFirst + create instead.
  const vendorMap = new Map<string, number>();
  if (format === 'medicine') {
    const uniqueVendors = Array.from(vendorStats.keys());
    for (const vName of uniqueVendors) {
      const existing = await prisma.vendor.findFirst({
        where: { name: vName },
        select: { id: true },
      });
      if (existing) {
        vendorMap.set(vName, existing.id);
      } else {
        const v = await prisma.vendor.create({
          data: {
            name: vName,
            phone: '+880000000000',
            category: 'medicine',
            isActive: true,
          },
          select: { id: true },
        });
        vendorMap.set(vName, v.id);
        vendorsCreated++;
      }
    }
  }

  // Upsert subcategories + create products in a transaction (batch)
  // to avoid thousands of individual queries.
  const subCategoryMap = new Map<string, number>();
  const newRows = parsedRows.filter((r) => {
    const key = r.name.trim().toLowerCase();
    return !existingNames.has(key);
  });

  // Dedup the new rows by name (in case the same name appears in multiple sheets)
  const dedupedNewRows = new Map<string, (typeof newRows)[number]>();
  for (const r of newRows) {
    const key = r.name.trim().toLowerCase();
    if (!dedupedNewRows.has(key)) {
      dedupedNewRows.set(key, r);
    }
  }

  let imported = 0;
  let skippedDuplicates = 0;
  let errors = 0;

  // Create products in batches of 50 to avoid huge transactions
  const batchSize = 50;
  const allNewRows = Array.from(dedupedNewRows.values());

  for (let i = 0; i < allNewRows.length; i += batchSize) {
    const batch = allNewRows.slice(i, i + batchSize);

    for (const row of batch) {
      try {
        // Upsert subcategory if needed
        let subCategoryId: number | null = null;
        if (row.subCategoryName) {
          const scSlug = slugify(row.subCategoryName);
          if (!subCategoryMap.has(scSlug)) {
            const sc = await prisma.subCategory.upsert({
              where: { slug: scSlug },
              create: { slug: scSlug, name: row.subCategoryName, categoryId: category.id },
              update: {},
            });
            subCategoryMap.set(scSlug, sc.id);
            subCategoriesCreated++;
          }
          subCategoryId = subCategoryMap.get(scSlug) ?? null;
        }

        // Generate a unique SKU
        const sku = `${slugify(row.name)}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;

        // Create the product
        await prisma.product.create({
          data: {
            name: row.name,
            sku,
            brand: row.brand,
            salePrice: row.salePrice,
            purchasePrice: 0, // operators fill in via morning workflow
            discountPrice: row.discountPrice ?? null,
            categoryId: category.id,
            subCategoryId,
            vendorId: format === 'medicine' ? (vendorMap.get(row.vendorName ?? '') ?? null) : null,
            unit: row.unit,
            imageUrl: row.imageUrl,
            isActive: true,
          },
        });
        imported++;
      } catch (_err) {
        errors++;
        // Continue with the rest of the batch
      }
    }
  }

  skippedDuplicates = parsedRows.length - imported - errors;

  const result: ImportResult = {
    format,
    imported,
    skippedDuplicates,
    errors,
    categoriesCreated: 1, // we create one category per import
    subCategoriesCreated,
    vendorsCreated,
  };
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveGroupName(filename: string): string {
  // "chaldal_candy-chocolate.xlsx" → "Candy Chocolate"
  const base = filename.replace(/\.(xlsx?|csv)$/i, '');
  const parts = base.split(/[_-]/).slice(-2); // last 2 parts
  return parts
    .map((p) => capitalize(p))
    .join(' ');
}

function deriveCategoryName(filename: string): string {
  // "chaldal_candy-chocolate.xlsx" → "Candy & Chocolate"
  const base = filename.replace(/\.(xlsx?|csv)$/i, '');
  const parts = base.split(/[_-]/).slice(-2);
  return parts
    .map((p) => capitalize(p))
    .join(' & ');
}
