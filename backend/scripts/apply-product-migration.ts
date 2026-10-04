import { prisma } from '../src/prisma/client.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const sqlPath = path.join(process.cwd(), 'prisma/migrations/20261004183000_add_product_catalog/migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Applying Product Catalog migration to Supabase...');
  
  // Split statements by semicolon and execute each
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    console.log(`Executing:\n${statement.substring(0, 80)}...`);
    await prisma.$executeRawUnsafe(statement);
  }

  console.log('Migration applied successfully!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
