// Bulk product import script — imports products from a CSV file.
// Run with: unset DATABASE_URL && npx tsx scripts/import-products.ts <products.csv>
//
// CSV format (header row required):
//   name,sku,price,category_slug,vendor_name,unit
//   Paracetamol 500mg,MED-PARA-500,120,medicine,City Pharma,box
//   Rice Basmati 5kg,GRO-RICE-5KG,850,grocery,Hashem Grocery,bag
//
// The script:
//   1. Reads the CSV
//   2. Looks up category by slug + vendor by name
//   3. Creates products (skips duplicates by SKU)
//   4. Reports: created, skipped, errors

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

interface CsvRow {
  name: string;
  sku: string;
  price: number;
  category_slug: string;
  vendor_name: string;
  unit: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row + at least 1 data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const required = ['name', 'sku', 'price', 'category_slug', 'vendor_name', 'unit'];
  for (const req of required) {
    if (!headers.includes(req)) {
      throw new Error(`Missing required column: ${req}. Found: ${headers.join(', ')}`);
    }
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    if (parts.length < 6) {
      console.warn(`  Skipping line ${i + 1}: not enough columns`);
      continue;
    }
    const row: CsvRow = {
      name: parts[headers.indexOf('name')],
      sku: parts[headers.indexOf('sku')],
      price: parseFloat(parts[headers.indexOf('price')]),
      category_slug: parts[headers.indexOf('category_slug')],
      vendor_name: parts[headers.indexOf('vendor_name')],
      unit: parts[headers.indexOf('unit')] || 'pcs',
    };
    if (!row.name || !row.sku || isNaN(row.price)) {
      console.warn(`  Skipping line ${i + 1}: invalid data`);
      continue;
    }
    rows.push(row);
  }
  return rows;
}

async function main() {
  const csvFile = process.argv[2];
  if (!csvFile) {
    console.error('Usage: npx tsx scripts/import-products.ts <products.csv>');
    process.exit(1);
  }

  console.info(`\n📦 Importing products from: ${csvFile}\n`);

  const content = readFileSync(csvFile, 'utf-8');
  const rows = parseCsv(content);
  console.info(`Parsed ${rows.length} rows from CSV.\n`);

  // Cache categories + vendors for fast lookup
  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map((c) => [c.slug, c]));

  const vendors = await prisma.vendor.findMany();
  const vendorMap = new Map(vendors.map((v) => [v.name.toLowerCase(), v]));

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const category = catMap.get(row.category_slug);
    if (!category) {
      console.error(`  ✗ ${row.sku}: category '${row.category_slug}' not found`);
      errors++;
      continue;
    }

    const vendor = vendorMap.get(row.vendor_name.toLowerCase());
    if (!vendor) {
      console.error(`  ✗ ${row.sku}: vendor '${row.vendor_name}' not found`);
      errors++;
      continue;
    }

    const existing = await prisma.product.findUnique({ where: { sku: row.sku } });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        name: row.name,
        sku: row.sku,
        price: row.price,
        categoryId: category.id,
        vendorId: vendor.id,
        unit: row.unit,
      },
    });
    created++;

    if (created % 100 === 0) {
      console.info(`  ... ${created} products imported...`);
    }
  }

  console.info('\n📊 Import Summary:');
  console.info(`   Created: ${created}`);
  console.info(`   Skipped: ${skipped} (duplicate SKU)`);
  console.info(`   Errors:  ${errors}`);
  console.info(`   Total products in DB: ${created + skipped + (await prisma.product.count()) - created}`);
  console.info('\n✅ Import complete.\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
