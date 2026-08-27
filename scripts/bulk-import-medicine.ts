/**
 * Bulk Import — Medicine products from Excel/CSV (24K+ rows).
 *
 * Usage:
 *   npx tsx scripts/bulk-import-medicine.ts --file ./medicine.xlsx
 *
 * Excel format:
 *   Columns: Name of the Manufacturer, Brand Name, Generic Name,
 *            Strength, Dosage Description, Price, Use For
 *
 * What this script does:
 *   1. Reads the Excel file
 *   2. For each row:
 *      - Name = "{Brand Name} {Strength}" (e.g. "Maxpime 500 mg/vial")
 *      - SKU = auto-generated from brand + generic + strength
 *      - Price = Price column (0-price → isActive=false)
 *      - genericName = Generic Name column
 *      - unit = Dosage Description
 *      - Vendor = Manufacturer (created on the fly, category=medicine)
 *   3. Batch inserts in groups of 500 for speed
 *   4. Logs progress every 1000 rows
 *
 * Flags:
 *   --file      Path to the Excel file (default: ./medicine.xlsx)
 *   --dry-run   Don't write to DB, just print what would be imported
 *   --batch-size  Number of products per insert batch (default: 500)
 */

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── CLI args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileFlag = args.find((a) => a.startsWith('--file='));
const dryRun = args.includes('--dry-run');
const batchSizeFlag = args.find((a) => a.startsWith('--batch-size='));

const filePath = fileFlag ? fileFlag.split('=')[1] : './medicine.xlsx';
const batchSize = batchSizeFlag ? parseInt(batchSizeFlag.split('=')[1], 10) : 500;

// ─── Helpers ────────────────────────────────────────────────────

function generateSku(brand: string, generic: string, strength: string): string {
  const parts = [brand, generic, strength]
    .filter(Boolean)
    .map((p) => p.toUpperCase().replace(/[^A-Z0-9]+/g, '-'))
    .join('-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  // Add a short random suffix to avoid collisions
  return `${parts}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.info('\n💊 Rizqun Bulk Import — Medicine\n');
  console.info(`  File:       ${filePath}`);
  console.info(`  Dry run:    ${dryRun}`);
  console.info(`  Batch size: ${batchSize}\n`);

  // Find the medicine category
  const category = await prisma.category.findUnique({ where: { slug: 'medicine' } });
  if (!category) {
    throw new Error("Category 'medicine' not found. Run 'npx prisma db seed' first.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read the Excel file
  console.info('Reading Excel file...');
  const workbook = XLSX.readFile(filePath);
  console.info(`Sheets: ${workbook.SheetNames.join(', ')}\n`);

  // Process the first sheet (or all sheets)
  let totalRows = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalDeactivated = 0;

  // Cache vendors by manufacturer name to avoid repeated DB queries
  const vendorCache = new Map<string, number>();

  for (const sheetName of workbook.SheetNames) {
    console.info(`\n📋 Sheet: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: '',
    });

    console.info(`  Rows: ${rows.length}`);
    totalRows += rows.length;

    const batch: Prisma.ProductCreateManyInput[] = [];

    for (const row of rows) {
      const manufacturer = String(
        row['Name of the Manufacturer'] || row['Manufacturer'] || '',
      ).trim();
      const brandName = String(row['Brand Name'] || row['Brand'] || '').trim();
      const genericName = String(row['Generic Name'] || row['Generic'] || '').trim();
      const strength = String(row['Strength'] || '').trim();
      const dosage = String(row['Dosage Description'] || row['Dosage'] || '').trim();
      const priceStr = String(row['Price'] || row['price'] || '0').trim();
      const useFor = String(row['Use For'] || '').trim();

      // Build product name: "Brand Strength" (e.g. "Maxpime 500 mg/vial")
      const name = [brandName, strength].filter(Boolean).join(' ').trim();
      if (!name) {
        totalSkipped++;
        continue;
      }

      const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
      const sku = generateSku(brandName, genericName, strength);

      // Skip if SKU already exists
      if (!dryRun) {
        const existing = await prisma.product.findUnique({ where: { sku } });
        if (existing) {
          totalSkipped++;
          continue;
        }
      }

      // Find or create vendor (manufacturer)
      let vendorId = 0;
      const vendorName = manufacturer || 'Unknown Manufacturer';
      if (vendorCache.has(vendorName)) {
        vendorId = vendorCache.get(vendorName)!;
      } else if (!dryRun) {
        const vendor = await prisma.vendor.findFirst({
          where: { name: { equals: vendorName, mode: 'insensitive' } },
        });
        if (vendor) {
          vendorId = vendor.id;
        } else {
          const newVendor = await prisma.vendor.create({
            data: {
              name: vendorName,
              phone: '0000000000',
              category: 'medicine',
              isActive: true,
            },
          });
          vendorId = newVendor.id;
          console.info(`  → Created vendor: ${vendorName} (id=${vendorId})`);
        }
        vendorCache.set(vendorName, vendorId);
      }

      if (price === 0) totalDeactivated++;

      batch.push({
        name,
        sku,
        price,
        categoryId: category.id,
        vendorId,
        unit: dosage || 'pcs',
        genericName: genericName || null,
        isActive: price > 0,
      });

      // Insert in batches
      if (batch.length >= batchSize) {
        if (!dryRun) {
          await prisma.product.createMany({ data: batch, skipDuplicates: true });
        }
        totalImported += batch.length;
        console.info(`  ✓ Imported ${totalImported} / ${totalRows}...`);
        batch.length = 0; // clear the batch
      }
    }

    // Insert remaining items in the batch
    if (batch.length > 0) {
      if (!dryRun) {
        await prisma.product.createMany({ data: batch, skipDuplicates: true });
      }
      totalImported += batch.length;
      console.info(`  ✓ Imported ${totalImported} / ${totalRows}...`);
    }
  }

  console.info(`\n\n📊 Import Summary:`);
  console.info(`  Total rows in Excel: ${totalRows}`);
  console.info(`  Total imported:      ${totalImported}`);
  console.info(`  Total skipped:       ${totalSkipped}`);
  console.info(`  Deactivated (price=0): ${totalDeactivated}`);
  console.info(`  Vendors created:     ${vendorCache.size}`);
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
