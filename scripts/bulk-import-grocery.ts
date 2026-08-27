/**
 * Bulk Import — Grocery products from Excel + image download.
 * v3: Uses Section → Group → Category → SubCategory hierarchy.
 *
 * Hierarchy mapping:
 *   Section = Grocery (hardcoded via --section flag)
 *   Group = from Index sheet "Category" column (e.g. "Cooking")
 *   Category = from sheet name (e.g. "Spices", "Rice", "Oil")
 *   SubCategory = from Index sheet "Subcategory" column (e.g. "Spices")
 *   Product = each row (with brand from "Brand" column)
 *
 * Usage:
 *   npx tsx scripts/bulk-import-grocery.ts --dir ./excel-files --section grocery
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dirFlag = args.find((a) => a.startsWith('--dir='));
const sectionFlag = args.find((a) => a.startsWith('--section='));
const dryRun = args.includes('--dry-run');
const skipImages = args.includes('--skip-images');

const dirPath = dirFlag ? dirFlag.split('=')[1] : './excel-files';
const sectionSlug = sectionFlag ? sectionFlag.split('=')[1] : 'grocery';

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
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

async function findOrCreateSection(slug: string, name: string) {
  const existing = await prisma.section.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.section.create({ data: { slug, name } });
}

async function findOrCreateGroup(slug: string, name: string, sectionId: number) {
  const existing = await prisma.group.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.group.create({ data: { slug, name, sectionId } });
}

async function findOrCreateCategory(slug: string, name: string, groupId: number) {
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.category.create({ data: { slug, name, groupId } });
}

async function findOrCreateSubCategory(slug: string, name: string, categoryId: number) {
  const existing = await prisma.subCategory.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.subCategory.create({ data: { slug, name, categoryId } });
}

async function main() {
  console.info('\n📦 Rizqun Bulk Import — Grocery (v3: Section→Group→Category→SubCategory)\n');
  console.info(`  Directory: ${dirPath}`);
  console.info(`  Section:   ${sectionSlug}`);
  console.info(`  Dry run:   ${dryRun}\n`);

  const section = await findOrCreateSection(sectionSlug, sectionSlug.charAt(0).toUpperCase() + sectionSlug.slice(1));
  console.info(`  ✓ Section: ${section.name} (id=${section.id})`);

  const files = fs.readdirSync(dirPath).filter(
    (f) => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'),
  );
  if (files.length === 0) { console.info('No Excel files found.'); return; }

  console.info(`\nFound ${files.length} Excel file(s):\n`);
  files.forEach((f) => console.info(`  - ${f}`));

  let totalImported = 0;
  let totalSkipped = 0;
  let totalImages = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    console.info(`\n\n📄 Processing: ${file}`);

    const workbook = XLSX.readFile(filePath);

    // ─── Read the Index sheet to get Group (Category column) + SubCategory mapping ──
    const indexSheet = workbook.Sheets['Index'];
    let indexRows: Array<{ Subcategory?: string; Category?: string }> = [];
    if (indexSheet) {
      indexRows = XLSX.utils.sheet_to_json(indexSheet, { raw: false, defval: '' });
      console.info(`   Index sheet: ${indexRows.length} rows`);
    }

    // Build a lookup: sheet name → { groupName, subCategoryName }
    const sheetLookup = new Map<string, { groupName: string; subCategoryName: string }>();
    for (const row of indexRows) {
      const sub = String(row['Subcategory'] || '').trim();
      const cat = String(row['Category'] || '').trim();
      if (sub) {
        sheetLookup.set(sub, {
          groupName: cat || 'General',
          subCategoryName: sub,
        });
      }
    }

    for (const sheetName of workbook.SheetNames) {
      if (sheetName === 'Index') continue;

      console.info(`\n   📋 Sheet: ${sheetName}`);

      // Determine Group from the Index sheet's "Category" column
      const lookup = sheetLookup.get(sheetName);
      const groupName = lookup?.groupName || 'General';
      const subCategoryName = lookup?.subCategoryName || sheetName;

      console.info(`      Group: ${groupName} | SubCategory: ${subCategoryName}`);

      // Find or create Group
      let groupId = 0;
      if (!dryRun) {
        const group = await findOrCreateGroup(slugify(groupName), groupName, section.id);
        groupId = group.id;
      }

      // Find or create Category (from sheet name)
      let categoryId = 0;
      if (!dryRun) {
        const category = await findOrCreateCategory(slugify(sheetName), sheetName, groupId);
        categoryId = category.id;
      }

      // Find or create SubCategory (from Index sheet)
      let subCategoryId: number | null = null;
      if (!dryRun && subCategoryName !== sheetName) {
        const sub = await findOrCreateSubCategory(slugify(subCategoryName), subCategoryName, categoryId);
        subCategoryId = sub.id;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: '' });
      console.info(`      Rows: ${rows.length}`);

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

        let localImageUrl: string | null = null;
        if (!skipImages && imageUrl) {
          localImageUrl = await downloadImage(imageUrl, name);
          if (localImageUrl) totalImages++;
        }

        const sku = `${slugify(name)}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;

        if (!dryRun) {
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
              vendorId: null,
              unit,
              imageUrl: localImageUrl,
              isActive: price > 0,
            },
          });
        }

        totalImported++;
        if (totalImported % 100 === 0) console.info(`      ✓ Imported ${totalImported} products...`);
      }
    }
  }

  console.info(`\n\n📊 Import Summary:`);
  console.info(`  Total imported: ${totalImported}`);
  console.info(`  Total skipped:  ${totalSkipped}`);
  console.info(`  Images downloaded: ${totalImages}`);
  console.info('\n✅ Import completed.\n');
}

main().catch((err) => { console.error('\n❌ Import failed:\n', err); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
