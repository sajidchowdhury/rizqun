import { read, utils } from 'xlsx';
import * as fs from 'fs';

const files = [
  '/home/z/my-project/upload/chaldal_candy-chocolate.xlsx',
  '/home/z/my-project/upload/18. Labaid.xlsx',
];

for (const file of files) {
  console.log('\n' + '='.repeat(80));
  console.log(`File: ${file}`);
  console.log('='.repeat(80));

  const buf = fs.readFileSync(file);
  const wb = read(buf, { type: 'buffer' });

  console.log(`Sheet names: ${wb.SheetNames}`);

  for (const sheetName of wb.SheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = wb.Sheets[sheetName];
    const rows = utils.sheet_to_json(sheet, { header: 1, defval: null });
    console.log(`Total rows: ${rows.length}`);

    // Print first 5 rows
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      console.log(`Row ${i}: ${JSON.stringify(rows[i])}`);
    }
  }
}
