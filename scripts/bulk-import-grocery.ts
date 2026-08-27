/**
 * Bulk Import — Grocery products from Excel + image download.
 *
 * Usage:
 *   npx tsx scripts/bulk-import-grocery.ts --dir ./excel-files --category grocery
 *
 * Excel format (each file = one category, each sheet = one sub-category):
 *   Columns: Name, Brand, Unit / Weight, Price (Tk), Discounted Price (Tk), Image URL, Product URL
 *
 * What this script does:
 *   1. Reads all .xlsx files in the given directory
 *   2. Iterates through all sheets in each file
 *   3. For each row:
 *      - Downloads the image from the Image URL to public/uploads/products/
 *      - Creates or reuses a vendor (based on the Brand column)
 *      - Creates the product in the database with imageUrl, price, etc.
 *   4. Logs progress
 *
 * Flags:
 *   --dir       Directory containing .xlsx files (default: ./excel-files)
 *   --category  Category slug: grocery, medicine, or other (default: grocery)
 *   --dry-run   Don't write to DB, just print what would be imported
 *   --skip-images  Don't download images, just import products
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── CLI args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dirFlag = args.find((a) => a.startsWith('--dir='));
const categoryFlag = args.find((a) => a.startsWith('--category='));
const dryRun = args.includes('--dry-run');
const skipImages = args.includes('--skip-images');

const dirPath = dirFlag ? dirFlag.split('=')[1] : './excel-files';
const categorySlug = categoryFlag ? categoryFlag.split('=')[1] : 'grocery';

// ─── Helpers ────────────────────────────────────────────────────

/** Sanitize a filename from a URL or product name. */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Download an image from a URL to a local file. Returns the relative path. */
async function downloadImage(url: string, productName: string): Promise<string | null> {
  if (!url || url.trim() === '') return null;

  try {
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const filename = `${sanitizeFilename(productName)}${ext}`;
    const filepath = path.join('public', 'uploads', 'products', filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      return `/uploads/products/${filename}`;
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Rizqun-Import/1.0' },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      console.warn(`  ⚠ Image download failed: ${response.status} for ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, buffer);
    return `/uploads/products/${filename}`;
  } catch (err) {
    console.warn(`  ⚠ Image download error: ${(err as Error).message}`);
    return null;
  }
}

/** Find or create a vendor by name + category. */
async function findOrCreateVendor(name: string, categorySlug: string): Promise<number> {
  const vendor = await prisma.vendor.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  if (vendor) return vendor.id;

  const newVendor = await prisma.vendor.create({
    data: {
      name,
      phone: '0000000000', // placeholder — admin can update later
      category: categorySlug as 'grocery' | 'medicine' | 'other',
      isActive: true,
    },
  });
  console.log(`  → Created vendor: ${name} (id=${newVendor.id})`);
  return newVendor.id;
}

/** Generate a unique SKU from name + brand. */
function generateSku(name: string, brand?: string): string {
  const parts = [brand, name]
    .filter(Boolean)
    .map((p) => p.toUpperCase().replace(/[^A-Z0-9]+/g, '-'))
    .join('-')
    .slice(0, 100);
  return `${parts}-${Date.now().toString(36).slice(-4)}`;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.info('\n📦 Rizqun Bulk Import — Grocery\n');
  console.info(`  Directory: ${dirPath}`);
  console.info(`  Category:  ${categorySlug}`);
  console.info(`  Dry run:    ${dryRun}`);
  console.info(`  Skip images: ${skipImages}\n`);

  // Find the category
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });
  if (!category) {
    throw new Error(`Category '${categorySlug}' not found. Run 'npx prisma db seed' first.`);
  }

  // Find all Excel files
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.xlsx') || f.endsWith('.xls'));

  if (files.length === 0) {
    console.info('No Excel files found in the directory.');
    return;
  }

  console.info(`Found ${files.length} Excel file(s):\n`);
  files.forEach((f) => console.info(`  - ${f}`));
  console.info('');

  let totalImported = 0;
  let totalSkipped = 0;
  let totalImagesDownloaded = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    console.info(`\n📄 Processing: ${file}`);

    const workbook = XLSX.readFile(filePath);
    console.info(`   Sheets: ${workbook.SheetNames.join(', ')}`);

    for (const sheetName of workbook.SheetNames) {
      console.info(`\n   📋 Sheet: ${sheetName}`);
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        defval: '',
      });

      console.info(`   Rows: ${rows.length}`);

      for (const row of rows) {
        // Extract columns — be flexible with column name casing/spacing
        const name = String(row['Name'] || row['name'] || '').trim();
        if (!name) {
          totalSkipped++;
          continue;
        }

        const brand = String(row['Brand'] || row['brand'] || '').trim();
        const unit = String(row['Unit / Weight'] || row['Unit'] || row['unit'] || '').trim() || 'pcs';
        const priceStr = String(row['Price (Tk)'] || row['Price'] || row['price'] || '0').trim();
        const discountedPriceStr = String(
          row['Discounted Price (Tk)'] || row['Discounted Price'] || row['discounted_price'] || '',
        ).trim();
        const imageUrl = String(row['Image URL'] || row['image_url'] || row['Image'] || '').trim();
        const productUrl = String(row['Product URL'] || row['product_url'] || '').trim();

        // Parse price
        const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
        const discountedPrice = parseFloat(discountedPriceStr.replace(/[^0-9.]/g, '')) || 0;

        // Determine final price + original price for discount
        const finalPrice = discountedPrice > 0 ? discountedPrice : price;
        const originalPrice = discountedPrice > 0 && discountedPrice < price ? price : null;
        const hasDiscount = originalPrice !== null;

        // SKU
        const sku = generateSku(name, brand);

        // Skip if product with same SKU already exists
        if (!dryRun) {
          const existing = await prisma.product.findUnique({ where: { sku } });
          if (existing) {
            totalSkipped++;
            continue;
          }
        }

        // Download image
        let localImageUrl: string | null = null;
        if (!skipImages && imageUrl) {
          localImageUrl = await downloadImage(imageUrl, name);
          if (localImageUrl) totalImagesDownloaded++;
        }

        // Create or reuse vendor
        let vendorId = 0;
        if (!dryRun) {
          vendorId = await findOrCreateVendor(brand || 'Unknown Vendor', categorySlug);
        }

        // Create product
        if (!dryRun) {
          await prisma.product.create({
            data: {
              name,
              sku,
              price: finalPrice,
              originalPrice: originalPrice ?? null,
              discountActive: hasDiscount,
              categoryId: category.id,
              vendorId,
              unit,
              imageUrl: localImageUrl,
              isActive: price > 0, // Deactivate 0-price products
            },
          });
        }

        totalImported++;
        if (totalImported % 100 === 0) {
          console.info(`   ✓ Imported ${totalImported} products...`);
        }
      }
    }
  }

  console.info(`\n\n📊 Import Summary:`);
  console.info(`  Total imported: ${totalImported}`);
  console.info(`  Total skipped:  ${totalSkipped}`);
  console.info(`  Images downloaded: ${totalImagesDownloaded}`);
  console.info('\n✅ Import completed.\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Import failed:\n', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
