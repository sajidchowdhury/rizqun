/**
 * Bulk Import — Grocery products from Excel + image download.
 * UPDATED: Uses `brand` as a text field on Product (NOT as a vendor).
 * Vendors are NOT created from the Brand column — they should be
 * assigned separately (vendors are shops/suppliers, not product brands).
 *
 * Usage:
 *   npx tsx scripts/bulk-import-grocery.ts --dir ./excel-files --category grocery
 *
 * Excel format (each file = one category, each sheet = one sub-category):
 *   Columns: Name, Brand, Unit / Weight, Price (Tk), Discounted Price (Tk), Image URL, Product URL
 *
 * What this script does:
 *   1. Reads all .xlsx files in the given directory
 *   2. For each file: creates a Category (from the filename, e.g. "cooking" → "Cooking")
 *   3. For each sheet: creates a SubCategory (from the sheet name, e.g. "Rice")
 *   4. For each row:
 *      - Sets `brand` from the Brand column (text field on Product)
 *      - Downloads the image from the Image URL to public/uploads/products/
 *      - Creates the product with imageUrl, price, brand, subCategoryId
 *      - Does NOT create a vendor — vendorId is left null
 *   5. The file name (minus extension) becomes the category slug
 *   6. The sheet name becomes the sub-category slug
 *
 * Flags:
 *   --dir       Directory containing .xlsx files (default: ./excel-files)
 *   --group     Group slug: grocery, medicine, or other (default: grocery)
 *   --dry-run   Don't write to DB, just print what would be imported
 *   --skip-images  Don't download images, just import products
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dirFlag = args.find((a) => a.startsWith('--dir='));
const groupFlag = args.find((a) => a.startsWith('--group='));
const dryRun = args.includes('--dry-run');
const skipImages = args.includes('--skip-images');

const dirPath = dirFlag ? dirFlag.split('=')[1] : './excel-files';
const groupSlug = groupFlag ? groupFlag.split('=')[1] : 'grocery';

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

async function downloadImage(url: string, productName: string): Promise<string | null> {
  if (!url || url.trim() === '') return null;
  try {
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const filename = `${sanitizeFilename(productName)}${ext}`;
    const filepath = path.join('public', 'uploads', 'products', filename);
    if (fs.existsSync(filepath)) return `/uploads/products/${filename}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Rizqun-Import/1.0' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, buffer);
    return `/uploads/products/${filename}`;
  } catch {
    return null;
  }
}

async function findOrCreateCategory(name: string, groupId: number): Promise<number> {
  const slug = slugify(name);
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const cat = await prisma.category.create({ data: { slug, name, groupId } });
  console.log(`  → Created category: ${name} (id=${cat.id})`);
  return cat.id;
}

async function findOrCreateSubCategory(name: string, categoryId: number): Promise<number> {
  const slug = slugify(name);
  const existing = await prisma.subCategory.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const sub = await prisma.subCategory.create({ data: { slug, name, categoryId } });
  console.log(`  → Created sub-category: ${name} (id=${sub.id})`);
  return sub.id;
}

async function main() {
  console.info('\n📦 Rizqun Bulk Import — Grocery (v2: brand as text, category hierarchy)\n');
  console.info(`  Directory: ${dirPath}`);
  console.info(`  Group:     ${groupSlug}`);
  console.info(`  Dry run:   ${dryRun}`);
  console.info(`  Skip images: ${skipImages}\n`);

  // Find the group
  const group = await prisma.group.findUnique({ where: { slug: groupSlug } });
  if (!group) throw new Error(`Group '${groupSlug}' not found.`);

  // Find all Excel files — skip temp files (~$xxx.xlsx created by Excel when open)
  const files = fs.readdirSync(dirPath).filter(
    (f) => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'),
  );
  if (files.length === 0) { console.info('No Excel files found.'); return; }

  console.info(`Found ${files.length} Excel file(s):\n`);
  files.forEach((f) => console.info(`  - ${f}`));
  console.info('');

  let totalImported = 0;
  let totalSkipped = 0;
  let totalImages = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    // Category name = filename without extension (e.g. "chaldal_cooking" → "Cooking")
    const categoryName = path.basename(file, path.extname(file))
      .replace(/^chaldal_/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    console.info(`\n📄 Processing: ${file} → Category: ${categoryName}`);

    const workbook = XLSX.readFile(filePath);
    let categoryId = 0;
    if (!dryRun) categoryId = await findOrCreateCategory(categoryName, group.id);

    for (const sheetName of workbook.SheetNames) {
      if (sheetName === 'Index') continue; // skip index sheets

      console.info(`\n   📋 Sheet: ${sheetName}`);
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: '' });
      console.info(`   Rows: ${rows.length}`);

      let subCategoryId = 0;
      if (!dryRun) subCategoryId = await findOrCreateSubCategory(sheetName, categoryId);

      for (const row of rows) {
        const name = String(row['Name'] || row['name'] || '').trim();
        if (!name) { totalSkipped++; continue; }

        const brand = String(row['Brand'] || row['brand'] || '').trim() || null;
        const unit = String(row['Unit / Weight'] || row['Unit'] || row['unit'] || '').trim() || 'pcs';
        const priceStr = String(row['Price (Tk)'] || row['Price'] || row['price'] || '0').trim();
        const discountedPriceStr = String(row['Discounted Price (Tk)'] || row['Discounted Price'] || '').trim();
        const imageUrl = String(row['Image URL'] || row['image_url'] || row['Image'] || '').trim();

        const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
        const discountedPrice = parseFloat(discountedPriceStr.replace(/[^0-9.]/g, '')) || 0;
        const finalPrice = discountedPrice > 0 ? discountedPrice : price;
        const originalPrice = discountedPrice > 0 && discountedPrice < price ? price : null;
        const hasDiscount = originalPrice !== null;

        // Download image
        let localImageUrl: string | null = null;
        if (!skipImages && imageUrl) {
          localImageUrl = await downloadImage(imageUrl, name);
          if (localImageUrl) totalImages++;
        }

        // Generate SKU
        const sku = `${slugify(name)}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;

        if (!dryRun) {
          // Check if product with same name already exists
          const existing = await prisma.product.findFirst({ where: { name, isActive: true } });
          if (existing) { totalSkipped++; continue; }

          await prisma.product.create({
            data: {
              name,
              sku,
              brand,
              price: finalPrice,
              originalPrice: originalPrice ?? null,
              discountActive: hasDiscount,
              categoryId,
              subCategoryId,
              vendorId: null, // no vendor assigned — user assigns later
              unit,
              imageUrl: localImageUrl,
              isActive: price > 0,
            },
          });
        }

        totalImported++;
        if (totalImported % 100 === 0) console.info(`   ✓ Imported ${totalImported} products...`);
      }
    }
  }

  console.info(`\n\n📊 Import Summary:`);
  console.info(`  Total imported: ${totalImported}`);
  console.info(`  Total skipped:  ${totalSkipped}`);
  console.info(`  Images downloaded: ${totalImages}`);
  console.info('\n✅ Import completed.\n');
  console.info('⚠️  Note: No vendors were assigned. Use the admin UI to assign vendors (shops) to products.');
}

main().catch((err) => { console.error('\n❌ Import failed:\n', err); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
