import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role, FollowupStatus, FollowupFrequency, EnquiryStatus } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';
import { checkOverdueFollowups } from '../src/services/followup.jobs.js';

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
  console.info('   CRM FOLLOW-UP & NOTIFICATIONS MODULE TEST SUITE         ');
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

  console.info('🔧 Setting up test actors in database...');
  const testPasswordHash = await argon2.hash('TestPass12345!', { type: argon2.argon2id });

  // Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'test_admin_followup@crm.internal' },
    update: { isActive: true },
    create: {
      name: 'Admin Followup Tester',
      email: 'test_admin_followup@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.ADMIN,
    },
  });

  // Manager (supervised by Admin)
  const managerUser = await prisma.user.upsert({
    where: { email: 'test_mgr_followup@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id },
    create: {
      name: 'Manager Followup Tester',
      email: 'test_mgr_followup@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.MANAGER,
      supervisorId: adminUser.id,
    },
  });

  // Employee (supervised by Manager)
  const employeeUser = await prisma.user.upsert({
    where: { email: 'test_emp_followup@crm.internal' },
    update: { isActive: true, supervisorId: managerUser.id },
    create: {
      name: 'Employee Followup Tester',
      email: 'test_emp_followup@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
      supervisorId: managerUser.id,
    },
  });

  // Test Customer
  const customer = await prisma.customer.upsert({
    where: { id: 'test-followup-customer-001' },
    update: {},
    create: {
      id: 'test-followup-customer-001',
      name: 'Followup Test Corp',
      phone: '+918888877777',
      email: 'info@followuptest.internal',
    },
  });

  // Test Enquiry
  const enquiry = await prisma.enquiry.create({
    data: {
      customerId: customer.id,
      phone: customer.phone,
      product: 'Consulting Retainer',
      status: EnquiryStatus.NEW,
      assignedToId: employeeUser.id,
      createdById: managerUser.id,
    },
  });

  // Log in
  console.info('🔑 Authenticating test employee...');
  const employeeToken = await loginUser('test_emp_followup@crm.internal', 'TestPass12345!');

  console.info('\n▶ Running Follow-up & Notifications Test Cases:\n');

  // =========================================================================
  // TEST CASE 1: Creating a followup with a past dueAt is rejected (400)
  // =========================================================================
  try {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour in the past
    const res = await fetch(`${API_BASE}/followups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enquiryId: enquiry.id,
        dueAt: pastDate,
        purpose: 'Past due date test',
      }),
    });

    const passed = res.status === 400;
    report(
      'Test 1: Creating a follow-up with past dueAt is rejected with HTTP 400',
      passed,
      `Expected HTTP 400, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 1: Creating a follow-up with past dueAt is rejected', false, String(err));
  }

  // =========================================================================
  // TEST CASE 1B: POST /followups with BOTH enquiryId and customerId (400)
  // =========================================================================
  try {
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await fetch(`${API_BASE}/followups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enquiryId: enquiry.id,
        customerId: customer.id, // BOTH provided
        dueAt: futureDate,
        purpose: 'Both IDs provided test',
      }),
    });

    const passed = res.status === 400;
    report(
      'Test 1B: Creating a follow-up with BOTH enquiryId and customerId is rejected with HTTP 400',
      passed,
      `Expected HTTP 400, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 1B: Creating a follow-up with BOTH enquiryId and customerId is rejected', false, String(err));
  }

  // =========================================================================
  // TEST CASE 1C: POST /followups with NEITHER enquiryId nor customerId (400)
  // =========================================================================
  try {
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await fetch(`${API_BASE}/followups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // NEITHER provided
        dueAt: futureDate,
        purpose: 'Neither ID provided test',
      }),
    });

    const passed = res.status === 400;
    report(
      'Test 1C: Creating a follow-up with NEITHER enquiryId nor customerId is rejected with HTTP 400',
      passed,
      `Expected HTTP 400, received HTTP ${res.status}`,
    );
  } catch (err) {
    report('Test 1C: Creating a follow-up with NEITHER enquiryId nor customerId is rejected', false, String(err));
  }

  // =========================================================================
  // TEST CASE 2: Completing a ONE_TIME followup does not create a new one
  // =========================================================================
  try {
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 1 day future
    const oneTimeFollowup = await prisma.followup.create({
      data: {
        enquiryId: enquiry.id,
        customerId: customer.id,
        assignedToId: employeeUser.id,
        dueAt: new Date(futureDate),
        purpose: 'Single call follow-up',
        frequency: FollowupFrequency.ONE_TIME,
        status: FollowupStatus.PENDING,
      },
    });

    const res = await fetch(`${API_BASE}/followups/${oneTimeFollowup.id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });

    const httpOk = res.status === 200;

    // Check DB state
    const updated = await prisma.followup.findUnique({
      where: { id: oneTimeFollowup.id },
    });

    // Check if any new pending followup was created for this enquiry
    const subsequentPending = await prisma.followup.findMany({
      where: {
        enquiryId: enquiry.id,
        id: { not: oneTimeFollowup.id },
        status: FollowupStatus.PENDING,
      },
    });

    const passed =
      httpOk &&
      updated?.status === FollowupStatus.COMPLETED &&
      updated.completedAt !== null &&
      subsequentPending.length === 0;

    report(
      'Test 2: Completing a ONE_TIME follow-up marks it COMPLETED and does NOT create a new one',
      passed,
      `HTTP Status: ${res.status}, Completed: ${updated?.status}, Next count: ${subsequentPending.length}`,
    );
  } catch (err) {
    report('Test 2: Completing a ONE_TIME follow-up does not create a new one', false, String(err));
  }

  // =========================================================================
  // TEST CASE 3: Completing a WEEKLY followup creates exactly one new Followup 7 days out
  // =========================================================================
  try {
    const weeklyFutureDate = new Date(Date.now() + 2 * 24 * 3600 * 1000); // 2 days in future
    const weeklyFollowup = await prisma.followup.create({
      data: {
        enquiryId: enquiry.id,
        customerId: customer.id,
        assignedToId: employeeUser.id,
        dueAt: weeklyFutureDate,
        purpose: 'Weekly client check-in',
        frequency: FollowupFrequency.WEEKLY,
        status: FollowupStatus.PENDING,
      },
    });

    const res = await fetch(`${API_BASE}/followups/${weeklyFollowup.id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });

    const httpOk = res.status === 200;

    // Directly query database to verify original and generated successor
    const original = await prisma.followup.findUnique({
      where: { id: weeklyFollowup.id },
    });

    const successors = await prisma.followup.findMany({
      where: {
        enquiryId: enquiry.id,
        id: { not: weeklyFollowup.id },
        frequency: FollowupFrequency.WEEKLY,
        status: FollowupStatus.PENDING,
      },
    });

    const exactlyOneSuccessor = successors.length === 1;
    let dueAt7DaysOut = false;

    if (exactlyOneSuccessor && successors[0]) {
      const nextDue = successors[0].dueAt.getTime();
      const expectedDue = Date.now() + 7 * 24 * 3600 * 1000;
      // Allow +/- 60 seconds tolerance
      dueAt7DaysOut = Math.abs(nextDue - expectedDue) < 60 * 1000;
    }

    const passed =
      httpOk &&
      original?.status === FollowupStatus.COMPLETED &&
      exactlyOneSuccessor &&
      dueAt7DaysOut;

    report(
      'Test 3: Completing a WEEKLY follow-up creates exactly one new Follow-up scheduled ~7 days out',
      passed,
      `HTTP Status: ${res.status}, Successor count: ${successors.length}, Due date ~7d: ${dueAt7DaysOut}`,
    );
  } catch (err) {
    report('Test 3: Completing a WEEKLY follow-up creates one 7 days out', false, String(err));
  }

  // =========================================================================
  // TEST CASE 4: Followup past dueAt triggers OVERDUE and generates Notifications
  // =========================================================================
  try {
    // 1. Manually insert a followup with dueAt 1 minute in the past
    const pastDueDate = new Date(Date.now() - 60 * 1000);
    const overdueCandidate = await prisma.followup.create({
      data: {
        enquiryId: enquiry.id,
        customerId: customer.id,
        assignedToId: employeeUser.id,
        dueAt: pastDueDate,
        purpose: 'Urgent contract negotiation follow-up',
        frequency: FollowupFrequency.ONE_TIME,
        status: FollowupStatus.PENDING,
      },
    });

    // 2. Invoke the overdue background job function directly
    const cronResult = await checkOverdueFollowups();

    // 3. Verify in database that status flipped to OVERDUE
    const updatedCandidate = await prisma.followup.findUnique({
      where: { id: overdueCandidate.id },
    });

    // 4. Verify Notifications created for assignee and supervisor
    const employeeNotification = await prisma.notification.findFirst({
      where: {
        userId: employeeUser.id,
        type: 'FOLLOWUP_OVERDUE',
      },
      orderBy: { createdAt: 'desc' },
    });

    const supervisorNotification = await prisma.notification.findFirst({
      where: {
        userId: managerUser.id,
        type: 'FOLLOWUP_OVERDUE',
      },
      orderBy: { createdAt: 'desc' },
    });

    const statusFlipped = updatedCandidate?.status === FollowupStatus.OVERDUE;
    const employeeNotified = employeeNotification !== null;
    const supervisorNotified = supervisorNotification !== null;

    const passed =
      cronResult.updatedCount >= 1 && statusFlipped && employeeNotified && supervisorNotified;

    report(
      'Test 4: Overdue cron job flips past-due follow-up to OVERDUE and notifies both Assignee and Supervisor',
      passed,
      `Status: ${updatedCandidate?.status}, Assignee Notified: ${employeeNotified}, Supervisor Notified: ${supervisorNotified}`,
    );
  } catch (err) {
    report('Test 4: Overdue cron job flips status and creates notifications', false, String(err));
  }

  // Cleanup test records (Activity/StatusHistory are append-only and cannot be deleted)
  try {
    await prisma.notification.deleteMany({
      where: { userId: { in: [employeeUser.id, managerUser.id, adminUser.id] } },
    });
    await prisma.followup.deleteMany({ where: { enquiryId: enquiry.id } });
    await prisma.enquiry.deleteMany({ where: { id: enquiry.id } });
  } catch (err) {
    // Note: Append-only tables prevent cascade delete by design
  }

  console.info('\n-----------------------------------------------------------');
  console.info(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${passedCount + failedCount})`);
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
