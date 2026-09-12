import { prisma } from '../src/prisma/client.js';

async function main() {
  console.log('Applying SystemSettings table creation...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemSettings" (
      "id" TEXT NOT NULL,
      "allowEmployeeReassignment" BOOLEAN NOT NULL DEFAULT false,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
    );
  `);

  // Verify
  const exists = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'SystemSettings';
  `);
  console.log('SystemSettings table verified:', exists);

  // Initialize singleton if not existing
  await prisma.$executeRawUnsafe(`
    INSERT INTO "SystemSettings" ("id", "allowEmployeeReassignment", "updatedAt")
    VALUES ('default', false, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
  `);

  console.log('Migration executed successfully.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
