import dotenv from 'dotenv';
import path from 'path';
import { Role } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';
import { emailService } from '../src/services/email.service.js';
import { enquiryService } from '../src/services/enquiry.service.js';
import { checkOverdueFollowups } from '../src/services/followup.jobs.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://localhost:5001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, errorDetail?: string): void {
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    results.push({ name: testName, passed: true });
  } else {
    console.error(`  ✖ [FAIL] ${testName}${errorDetail ? ` — ${errorDetail}` : ''}`);
    results.push({ name: testName, passed: false, error: errorDetail });
  }
}

async function loginAs(email: string, password = 'Password123!'): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${email} (status ${res.status})`);
  }

  const json = (await res.json()) as { data: { accessToken: string } };
  return json.data.accessToken;
}

async function runTests(): Promise<void> {
  console.log('\n===========================================================');
  console.log('   IN-APP NOTIFICATIONS & EMAIL ALERT SYSTEM TEST SUITE    ');
  console.log('===========================================================');

  // Find or verify seeded test users
  const adminUser = await prisma.user.findFirst({
    where: { role: Role.ADMIN, email: 'admin@hbcrm.local' },
  });
  const managerUser = await prisma.user.findFirst({
    where: { email: 'rajesh.verma@hbcrm.local' },
  });
  const employeeUser = await prisma.user.findFirst({
    where: { email: 'priya.sharma@hbcrm.local' },
  });
  const secondEmployee = await prisma.user.findFirst({
    where: { email: 'amit.patel@hbcrm.local' },
  });

  if (!adminUser || !managerUser || !employeeUser || !secondEmployee) {
    throw new Error('Test users missing. Please run database seed first.');
  }

  console.log('\n--- 1. EMAIL SERVICE UNIT VERIFICATION ---');
  // Test 1.1: Dev mode email logging fallback
  const emailRes = await emailService.sendEmail(
    'test.recipient@example.com',
    'Test Alert Subject',
    'This is a test notification email body.',
  );
  assert(
    emailRes.success === true,
    '1.1 Email service dispatches safely in dev mode without failing',
  );
  assert(
    emailRes.loggedOnly === true,
    '1.2 Dev mode correctly identified loggedOnly=true when RESEND_API_KEY is empty',
  );

  // Test 1.2: Decoupled resilience on invalid email input
  const invalidEmailRes = await emailService.sendEmail(
    'invalid-address',
    'Invalid Email Test',
    'Payload',
  );
  assert(
    invalidEmailRes.success === false && typeof invalidEmailRes.error === 'string',
    '1.3 Invalid email handled gracefully without throwing an unhandled exception',
  );

  console.log('\n--- 2. ENQUIRY ASSIGNMENT NOTIFICATIONS & HIGH-SIGNAL EMAIL ---');
  // Create an enquiry assigned directly to Priya
  const testEnquiry = await enquiryService.createEnquiry(
    { userId: managerUser.id, role: Role.MANAGER },
    {
      companyName: 'Notification System Test Corp',
      phone: '9988776655',
      product: 'Enterprise CRM Suite',
      assignedToId: employeeUser.id,
      customer: {
        name: 'Notification Test Customer',
        phone: '9988776655',
      },
    },
  );

  assert(Boolean(testEnquiry.id), '2.1 Enquiry created with initial assignee');

  // Verify notification row was created for Priya
  const priyaNotification = await prisma.notification.findFirst({
    where: {
      userId: employeeUser.id,
      type: 'ENQUIRY_ASSIGNED',
      relatedEnquiryId: testEnquiry.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  assert(
    Boolean(priyaNotification),
    '2.2 ENQUIRY_ASSIGNED notification created for assigned employee',
    priyaNotification?.message,
  );
  assert(
    priyaNotification?.read === false,
    '2.3 Newly generated notification defaults to read=false',
  );

  // Reassign enquiry to Amit
  await enquiryService.assignEnquiry(
    { userId: managerUser.id, role: Role.MANAGER },
    testEnquiry.id,
    secondEmployee.id,
  );

  const amitNotification = await prisma.notification.findFirst({
    where: {
      userId: secondEmployee.id,
      type: 'ENQUIRY_ASSIGNED',
      relatedEnquiryId: testEnquiry.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  assert(
    Boolean(amitNotification),
    '2.4 Reassignment generates new ENQUIRY_ASSIGNED notification for new assignee',
    amitNotification?.message,
  );

  console.log('\n--- 3. OVERDUE FOLLOW-UP CRON & HIGH-SIGNAL ALERTS ---');
  // Create an overdue follow-up for Priya (due 3 hours ago)
  const pastDue = new Date(Date.now() - 3 * 3600 * 1000);
  const overdueFollowup = await prisma.followup.create({
    data: {
      enquiryId: testEnquiry.id,
      assignedToId: employeeUser.id,
      dueAt: pastDue,
      purpose: 'Urgent contract signing follow-up',
    },
  });

  // Run the overdue check job
  const cronResult = await checkOverdueFollowups();
  assert(
    cronResult.updatedCount >= 1,
    '3.1 checkOverdueFollowups() detects and marks follow-up as OVERDUE',
    `Updated count: ${cronResult.updatedCount}`,
  );

  // Verify notification was created for Priya (assignee)
  const overdueNotificationPriya = await prisma.notification.findFirst({
    where: {
      userId: employeeUser.id,
      type: 'FOLLOWUP_OVERDUE',
      relatedEnquiryId: testEnquiry.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  assert(
    Boolean(overdueNotificationPriya),
    '3.2 FOLLOWUP_OVERDUE notification created for assignee',
    overdueNotificationPriya?.message,
  );

  // Verify notification was created for Rajesh (supervisor)
  const overdueNotificationRajesh = await prisma.notification.findFirst({
    where: {
      userId: managerUser.id,
      type: 'FOLLOWUP_OVERDUE',
      relatedEnquiryId: testEnquiry.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  assert(
    Boolean(overdueNotificationRajesh),
    '3.3 FOLLOWUP_OVERDUE notification created for supervisor',
    overdueNotificationRajesh?.message,
  );

  console.log('\n--- 4. REST API ENDPOINTS: IN-APP BELL & NOTIFICATIONS ---');
  const priyaToken = await loginAs(employeeUser.email);

  // Test 4.1: GET /notifications
  const listRes = await fetch(`${BASE_URL}/notifications?limit=10`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  assert(listRes.status === 200, '4.1 GET /notifications returns HTTP 200 OK');

  const listJson = (await listRes.json()) as {
    data: {
      notifications: Array<{ id: string; read: boolean; message: string }>;
      meta: { unreadCount: number; total: number };
    };
  };

  assert(
    listJson.data.notifications.length > 0,
    '4.2 Notifications list populated for authenticated user',
  );
  assert(
    listJson.data.meta.unreadCount >= 1,
    '4.3 meta.unreadCount tracks active unread count badge value',
    `Unread: ${listJson.data.meta.unreadCount}`,
  );

  // Test 4.2: PATCH /notifications/:id/read
  const targetNotification = listJson.data.notifications.find((n) => !n.read);
  assert(Boolean(targetNotification), '4.4 Found unread notification to test mark-read');

  if (targetNotification) {
    const markReadRes = await fetch(
      `${BASE_URL}/notifications/${targetNotification.id}/read`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${priyaToken}` },
      },
    );
    assert(
      markReadRes.status === 200,
      '4.5 PATCH /notifications/:id/read returns HTTP 200 OK',
    );

    const markReadJson = (await markReadRes.json()) as {
      data: { notification: { id: string; read: boolean } };
    };
    assert(
      markReadJson.data.notification.read === true,
      '4.6 Notification read status updated to true in database',
    );
  }

  // Test 4.3: GET /notifications?unreadOnly=true
  const unreadOnlyRes = await fetch(`${BASE_URL}/notifications?unreadOnly=true`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  const unreadOnlyJson = (await unreadOnlyRes.json()) as {
    data: { notifications: Array<{ read: boolean }> };
  };
  const allAreUnread = unreadOnlyJson.data.notifications.every((n) => !n.read);
  assert(
    allAreUnread,
    '4.7 GET /notifications?unreadOnly=true filters exclusively unread items',
  );

  // Test 4.4: PATCH /notifications/read-all
  const readAllRes = await fetch(`${BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  assert(
    readAllRes.status === 200,
    '4.8 PATCH /notifications/read-all returns HTTP 200 OK',
  );

  // Verify unreadCount is now 0 for Priya
  const postReadAllRes = await fetch(`${BASE_URL}/notifications?limit=10`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  const postReadAllJson = (await postReadAllRes.json()) as {
    data: { meta: { unreadCount: number } };
  };
  assert(
    postReadAllJson.data.meta.unreadCount === 0,
    '4.9 Bell badge unread count drops to 0 after mark-all-read',
    `Unread count: ${postReadAllJson.data.meta.unreadCount}`,
  );

  // Clean up mutable test records (Activity, AuditLog, StatusHistory are append-only protected)
  await prisma.followup.deleteMany({ where: { id: overdueFollowup.id } });
  await prisma.notification.deleteMany({ where: { relatedEnquiryId: testEnquiry.id } });

  console.log('\n===========================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`TEST RESULTS: ${passed} Passed, ${failed} Failed out of ${total}`);
  console.log('===========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error('Test suite encountered an unhandled fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
