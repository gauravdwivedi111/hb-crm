import dotenv from 'dotenv';
import path from 'path';
import { Role, EnquiryStatus, ActivityType } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';

// Load backend .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runAppendOnlyVerification(): Promise<void> {
  console.info('===========================================================');
  console.info('   APPEND-ONLY SECURITY HARDENING VERIFICATION SUITE       ');
  console.info('===========================================================');

  // Verify DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error('\x1b[31m[ERROR] Unable to connect to the PostgreSQL database.\x1b[0m');
    console.error('Please ensure your database is running and migrations are applied:');
    console.error('  npx prisma migrate deploy\n');
    process.exit(1);
  }

  console.info('Setting up temporary test record for verification...');

  // Setup test user
  const testUser = await prisma.user.upsert({
    where: { email: 'append_only_test@crm.internal' },
    update: {},
    create: {
      name: 'Append Only Tester',
      email: 'append_only_test@crm.internal',
      passwordHash: 'dummy_hash_for_test',
      role: Role.ADMIN,
    },
  });

  // Setup test customer
  const testCustomer = await prisma.customer.upsert({
    where: { id: 'test-append-only-cust' },
    update: {},
    create: {
      id: 'test-append-only-cust',
      name: 'Append Only Test Cust',
      phone: '+910000000000',
    },
  });

  // Setup test enquiry
  const testEnquiry = await prisma.enquiry.create({
    data: {
      customerId: testCustomer.id,
      phone: testCustomer.phone,
      product: 'Test Product',
      status: EnquiryStatus.NEW,
      createdById: testUser.id,
    },
  });

  // Create an Activity record (INSERT should succeed)
  const testActivity = await prisma.activity.create({
    data: {
      enquiryId: testEnquiry.id,
      userId: testUser.id,
      type: ActivityType.REMARK_ADDED,
      description: 'Original immutable activity record',
    },
  });

  // Create a StatusHistory record (INSERT should succeed)
  const testStatusHistory = await prisma.statusHistory.create({
    data: {
      enquiryId: testEnquiry.id,
      oldStatus: null,
      newStatus: EnquiryStatus.NEW,
      changedById: testUser.id,
      reason: 'Original status history record',
    },
  });

  // Create an AuditLog record (INSERT should succeed)
  const testAuditLog = await prisma.auditLog.create({
    data: {
      userId: testUser.id,
      action: 'TEST_INSERT',
      entityType: 'Enquiry',
      entityId: testEnquiry.id,
      metadata: { original: true },
    },
  });

  console.info('Initial records created successfully (INSERT confirmed working).\n');

  let allPassed = true;

  // -------------------------------------------------------------------------
  // TEST 1: Attempt UPDATE on Activity table
  // -------------------------------------------------------------------------
  console.info('Test 1: Attempting UPDATE on Activity record...');
  try {
    await prisma.activity.update({
      where: { id: testActivity.id },
      data: { description: 'Malicious modification attempt' },
    });
    console.error('  \x1b[31m✖ [FAIL] Activity UPDATE succeeded unexpectedly! Table is NOT append-only.\x1b[0m');
    allPassed = false;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('This table is append-only') || errMsg.includes('permission denied')) {
      console.info('  \x1b[32m✔ [PASS] Activity UPDATE was blocked by PostgreSQL!\x1b[0m');
      console.info(`         Reason: ${errMsg.split('\n').pop()}`);
    } else {
      console.error(`  \x1b[31m✖ [FAIL] Activity UPDATE failed with unexpected error: ${errMsg}\x1b[0m`);
      allPassed = false;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2: Attempt DELETE on Activity table
  // -------------------------------------------------------------------------
  console.info('\nTest 2: Attempting DELETE on Activity record...');
  try {
    await prisma.activity.delete({
      where: { id: testActivity.id },
    });
    console.error('  \x1b[31m✖ [FAIL] Activity DELETE succeeded unexpectedly! Table is NOT append-only.\x1b[0m');
    allPassed = false;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('This table is append-only') || errMsg.includes('permission denied')) {
      console.info('  \x1b[32m✔ [PASS] Activity DELETE was blocked by PostgreSQL!\x1b[0m');
      console.info(`         Reason: ${errMsg.split('\n').pop()}`);
    } else {
      console.error(`  \x1b[31m✖ [FAIL] Activity DELETE failed with unexpected error: ${errMsg}\x1b[0m`);
      allPassed = false;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3: Attempt UPDATE on StatusHistory table
  // -------------------------------------------------------------------------
  console.info('\nTest 3: Attempting UPDATE on StatusHistory record...');
  try {
    await prisma.statusHistory.update({
      where: { id: testStatusHistory.id },
      data: { reason: 'Altered reason history' },
    });
    console.error('  \x1b[31m✖ [FAIL] StatusHistory UPDATE succeeded unexpectedly!\x1b[0m');
    allPassed = false;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('This table is append-only') || errMsg.includes('permission denied')) {
      console.info('  \x1b[32m✔ [PASS] StatusHistory UPDATE was blocked by PostgreSQL!\x1b[0m');
      console.info(`         Reason: ${errMsg.split('\n').pop()}`);
    } else {
      console.error(`  \x1b[31m✖ [FAIL] StatusHistory UPDATE failed with unexpected error: ${errMsg}\x1b[0m`);
      allPassed = false;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 4: Attempt DELETE on AuditLog table
  // -------------------------------------------------------------------------
  console.info('\nTest 4: Attempting DELETE on AuditLog record...');
  try {
    await prisma.auditLog.delete({
      where: { id: testAuditLog.id },
    });
    console.error('  \x1b[31m✖ [FAIL] AuditLog DELETE succeeded unexpectedly!\x1b[0m');
    allPassed = false;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('This table is append-only') || errMsg.includes('permission denied')) {
      console.info('  \x1b[32m✔ [PASS] AuditLog DELETE was blocked by PostgreSQL!\x1b[0m');
      console.info(`         Reason: ${errMsg.split('\n').pop()}`);
    } else {
      console.error(`  \x1b[31m✖ [FAIL] AuditLog DELETE failed with unexpected error: ${errMsg}\x1b[0m`);
      allPassed = false;
    }
  }

  console.info('\n===========================================================');
  if (allPassed) {
    console.info('   \x1b[32mALL 4 APPEND-ONLY TESTS PASSED SUCCESSFULLY!\x1b[0m            ');
    console.info('   Activity, StatusHistory, and AuditLog are fully protected.');
  } else {
    console.error('   \x1b[31mSOME APPEND-ONLY TESTS FAILED!\x1b[0m                          ');
  }
  console.info('===========================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runAppendOnlyVerification()
  .catch((err) => {
    console.error('Fatal error during append-only verification:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
