import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role, EnquiryStatus, Priority } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';

// Load backend .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.PORT || '5001'}`;

interface LoginResponse {
  status: string;
  data: {
    accessToken: string;
    user: { id: string; name: string; email: string; role: Role };
  };
}

let passedCount = 0;
let failedCount = 0;

function report(testName: string, passed: boolean, details?: string): void {
  if (passed) {
    passedCount++;
    console.info(`  \x1b[32m✔ [PASS]\x1b[0m ${testName}`);
  } else {
    failedCount++;
    console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${testName}`);
    if (details) {
      console.error(`         \x1b[33mDetails: ${details}\x1b[0m`);
    }
  }
}

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} (HTTP ${res.status}): ${text}`);
  }

  const json = (await res.json()) as LoginResponse;
  return json.data.accessToken;
}

async function runTests(): Promise<void> {
  console.info('===========================================================');
  console.info('   CRM ENQUIRY MODULE: AUTOMATED RBAC & AUDIT TEST SUITE   ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  // Verify DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error('\x1b[31m[ERROR] Unable to connect to the PostgreSQL database.\x1b[0m');
    console.error('Please ensure your database is running and migrations are applied:');
    console.error('  npx prisma migrate deploy\n');
    process.exit(1);
  }

  // 1. Prepare/Seed test actors
  console.info('🔧 Setting up test actors in database...');
  const testPasswordHash = await argon2.hash('TestPass12345!', { type: argon2.argon2id });

  // Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'test_admin@crm.internal' },
    update: { isActive: true },
    create: {
      name: 'Test Admin',
      email: 'test_admin@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.ADMIN,
    },
  });

  // Manager (supervised by Admin)
  const managerUser = await prisma.user.upsert({
    where: { email: 'test_manager@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id },
    create: {
      name: 'Test Manager',
      email: 'test_manager@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.MANAGER,
      supervisorId: adminUser.id,
    },
  });

  // Employee A (supervised by Manager)
  const employeeA = await prisma.user.upsert({
    where: { email: 'test_emp_a@crm.internal' },
    update: { isActive: true, supervisorId: managerUser.id, role: Role.EMPLOYEE },
    create: {
      name: 'Employee A',
      email: 'test_emp_a@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
      supervisorId: managerUser.id,
    },
  });

  // Employee B (independent employee, not subordinate to Manager)
  const employeeB = await prisma.user.upsert({
    where: { email: 'test_emp_b@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id, role: Role.EMPLOYEE },
    create: {
      name: 'Employee B',
      email: 'test_emp_b@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
      supervisorId: adminUser.id,
    },
  });

  // Test Customer
  const customer = await prisma.customer.upsert({
    where: { id: 'test-crm-customer-001' },
    update: {},
    create: {
      id: 'test-crm-customer-001',
      name: 'Acme Test Corp',
      phone: '+919999988888',
      email: 'contact@acmetest.internal',
    },
  });

  // 2. Obtain JWTs for each actor
  console.info('🔑 Authenticating test actors...');
  const managerToken = await loginUser('test_manager@crm.internal', 'TestPass12345!');
  const employeeAToken = await loginUser('test_emp_a@crm.internal', 'TestPass12345!');
  const employeeBToken = await loginUser('test_emp_b@crm.internal', 'TestPass12345!');

  // Ensure baseline system setting (allowEmployeeReassignment = false) for standard RBAC test
  await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: { allowEmployeeReassignment: false },
    create: { id: 'default', allowEmployeeReassignment: false },
  });
  await prisma.systemSettings.updateMany({
    data: { allowEmployeeReassignment: false },
  });

  // 3. Create Enquiries
  console.info('📝 Initializing test enquiries...');
  const enquiryA = await prisma.enquiry.create({
    data: {
      customerId: customer.id,
      phone: customer.phone,
      product: 'Enterprise CRM License',
      priority: Priority.HIGH,
      status: EnquiryStatus.NEW,
      assignedToId: employeeA.id,
      createdById: managerUser.id,
    },
  });

  const enquiryB = await prisma.enquiry.create({
    data: {
      customerId: customer.id,
      phone: customer.phone,
      product: 'Custom ERP Module',
      priority: Priority.MEDIUM,
      status: EnquiryStatus.NEW,
      assignedToId: employeeB.id,
      createdById: adminUser.id,
    },
  });

  console.info('\n▶ Running 5 Enquiry Module Test Cases:\n');

  // =========================================================================
  // TEST CASE 1: Employee attempts to read another Employee's enquiry (404)
  // =========================================================================
  try {
    const res = await fetch(`${API_BASE}/enquiries/${enquiryB.id}`, {
      headers: { Authorization: `Bearer ${employeeAToken}` },
    });
    const passed = res.status === 404;
    report(
      'Test 1: Employee A accessing Employee B enquiry returns 404 (Anti-Enumeration)',
      passed,
      `Expected HTTP 404, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 1: Employee A accessing Employee B enquiry returns 404', false, String(err));
  }

  // =========================================================================
  // TEST CASE 2: Manager reads subordinate's enquiry (200)
  // =========================================================================
  try {
    const res = await fetch(`${API_BASE}/enquiries/${enquiryA.id}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const passed = res.status === 200;
    const json = (await res.json()) as { data?: { enquiry?: { id: string } } };
    const correctId = json.data?.enquiry?.id === enquiryA.id;
    report(
      'Test 2: Manager accessing subordinate Employee A enquiry returns 200 OK',
      passed && correctId,
      `Expected HTTP 200 with id ${enquiryA.id}, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 2: Manager accessing subordinate enquiry returns 200 OK', false, String(err));
  }

  // =========================================================================
  // TEST CASE 3: Employee attempts PATCH /enquiries/:id/assign (403)
  // =========================================================================
  try {
    const res = await fetch(`${API_BASE}/enquiries/${enquiryA.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${employeeAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: employeeB.id }),
    });
    const passed = res.status === 403;
    report(
      'Test 3: Employee attempting to reassign enquiry returns 403 Forbidden',
      passed,
      `Expected HTTP 403, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 3: Employee attempting to reassign enquiry returns 403', false, String(err));
  }

  // =========================================================================
  // TEST CASE 4: Employee updates permitted fields on their own enquiry (200)
  // =========================================================================
  try {
    const res = await fetch(`${API_BASE}/enquiries/${enquiryA.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${employeeAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        remarks: 'Client requested a callback tomorrow afternoon',
        priority: Priority.HIGH,
      }),
    });
    const passed = res.status === 200;
    report(
      'Test 4: Employee successfully updates allowed fields on their own enquiry',
      passed,
      `Expected HTTP 200, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 4: Employee updates allowed fields on own enquiry', false, String(err));
  }

  // =========================================================================
  // TEST CASE 5: Status change produces exactly 1 StatusHistory and 1 Activity
  // =========================================================================
  try {
    // Check baseline counts in database
    const initialHistoryCount = await prisma.statusHistory.count({
      where: { enquiryId: enquiryA.id },
    });
    const initialActivityCount = await prisma.activity.count({
      where: { enquiryId: enquiryA.id },
    });

    const statusReason = 'Discussed specifications and moved to CONTACTED';

    const res = await fetch(`${API_BASE}/enquiries/${enquiryA.id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${employeeAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newStatus: EnquiryStatus.CONTACTED,
        reason: statusReason,
      }),
    });

    const httpOk = res.status === 200;

    // Directly query database via Prisma to verify atomic rows
    const finalHistoryCount = await prisma.statusHistory.count({
      where: { enquiryId: enquiryA.id },
    });
    const finalActivityCount = await prisma.activity.count({
      where: { enquiryId: enquiryA.id },
    });

    const latestHistory = await prisma.statusHistory.findFirst({
      where: { enquiryId: enquiryA.id },
      orderBy: { createdAt: 'desc' },
    });

    const latestActivity = await prisma.activity.findFirst({
      where: { enquiryId: enquiryA.id },
      orderBy: { createdAt: 'desc' },
    });

    const historyDeltaIsOne = finalHistoryCount === initialHistoryCount + 1;
    const activityDeltaIsOne = finalActivityCount === initialActivityCount + 1;
    const historyCorrect =
      latestHistory?.newStatus === EnquiryStatus.CONTACTED &&
      latestHistory?.oldStatus === EnquiryStatus.NEW &&
      latestHistory?.reason === statusReason;
    const activityCorrect =
      latestActivity?.type === 'STATUS_CHANGED' &&
      latestActivity?.newStatus === EnquiryStatus.CONTACTED &&
      latestActivity?.previousStatus === EnquiryStatus.NEW;

    const test5Passed =
      httpOk && historyDeltaIsOne && activityDeltaIsOne && historyCorrect && activityCorrect;

    report(
      'Test 5: Status transition creates exactly 1 StatusHistory and 1 Activity row in DB',
      test5Passed,
      `HTTP OK: ${httpOk}, History Delta (+1): ${historyDeltaIsOne}, Activity Delta (+1): ${activityDeltaIsOne}, Records Valid: ${historyCorrect && activityCorrect}`,
    );
  } catch (err) {
    report('Test 5: Status transition creates atomic audit rows in DB', false, String(err));
  }

  // Cleanup test enquiries (Activity, StatusHistory, AuditLog are protected by append-only triggers)
  try {
    await prisma.enquiry.deleteMany({ where: { id: { in: [enquiryA.id, enquiryB.id] } } });
  } catch (err) {
    // Note: Append-only tables prevent cascade delete by design
  }

  console.info('\n-----------------------------------------------------------');
  console.info(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: 5)`);
  console.info('-----------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error('Fatal error running tests:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
