import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';

// Ensure environment variables are loaded from backend/.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'System Administrator';

  if (!email || !password) {
    console.error(
      '❌ [Seed Error] SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables are required.',
    );
    console.error('Please define them in backend/.env before running the seed script.');
    process.exit(1);
  }

  if (password.length < 10) {
    console.error('❌ [Seed Error] SEED_ADMIN_PASSWORD must be at least 10 characters long.');
    process.exit(1);
  }

  console.info(`🌱 Seeding Admin user (${email})...`);

  // Hash password with argon2id exactly as loginUser and registerUser expect
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      name,
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.info(`✅ Admin user seeded successfully! (ID: ${admin.id}, Email: ${admin.email}, Role: ${admin.role})`);
}

main()
  .catch((error) => {
    console.error('❌ Seed execution failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
