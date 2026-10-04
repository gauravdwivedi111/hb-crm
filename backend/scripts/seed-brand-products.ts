import { prisma } from '../src/prisma/client.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const jsonPath = path.join(process.cwd(), 'prisma/brand-products.json');
  console.log(`Reading products from ${jsonPath}...`);
  const content = fs.readFileSync(jsonPath, 'utf-8');
  const products: any[] = JSON.parse(content);

  console.log(`Loaded ${products.length} products. Inserting into Supabase in batches...`);

  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE).map((p) => ({
      code: String(p.code),
      name: String(p.name),
      brand: p.brand || null,
      category: p.category || null,
      subCategory: p.subCategory || null,
      department: p.department || null,
      description: p.description || null,
      packSize: p.packSize || null,
      unit: p.unit || 'Pcs',
      hsnCode: p.hsnCode != null ? String(p.hsnCode) : null,
      taxRate: Number(p.taxRate || 18),
      unitPrice: Number(p.unitPrice || 0),
      mrp: p.mrp != null ? Number(p.mrp) : null,
      purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
      isActive: true,
    }));

    const result = await prisma.product.createMany({
      data: chunk,
      skipDuplicates: true,
    });

    totalInserted += result.count;
    console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${result.count} items, cumulative: ${totalInserted})`);
  }

  const dbCount = await prisma.product.count();
  console.log(`\nAll done! Total products in database: ${dbCount}`);

  // Summary by Brand
  const brands = await prisma.product.groupBy({
    by: ['brand'],
    _count: { id: true },
  });
  console.log('\n--- Brand Breakdown ---');
  for (const b of brands) {
    console.log(`${b.brand || 'Unbranded'}: ${b._count.id} products`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
