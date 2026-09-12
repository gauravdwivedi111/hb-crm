import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role, EnquiryStatus, FollowupStatus, Priority } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.PORT || '5001'}`;

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

async function loginUser(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} (HTTP ${res.status}): ${text}`);
  }

  const json = (await res.json()) as { data: { accessToken: string } };
  return { token: json.data.accessToken };
}

async function run() {
  console.log('\n===========================================================');
  console.log('       EMPLOYEE PROFILE & ANTI-ENUMERATION TEST SUITE');
  console.log('===========================================================');
  console.log(`Target Backend: ${API_BASE}\n`);

  const passwordHash = await argon2.hash('TestPassword123!', { type: argon2.argon2id });

  // 1. Setup Test Users
  // Admin
  const adminEmail = 'admin@hbcrm.local';
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Super Admin',
        email: adminEmail,
        passwordHash,
        role: Role.ADMIN,
      },
    });
  }

  async function cleanupTestData(emails: string[]) {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.followup.deleteMany({ where: { assignedToId: { in: userIds } } });
      await prisma.enquiry.deleteMany({
        where: {
          OR: [
            { assignedToId: { in: userIds } },
            { createdById: { in: userIds } },
          ],
        },
      });
      await prisma.customer.deleteMany({ where: { assignedToId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  // Manager 1 & Subordinate 1
  const m1Email = 'test-mgr1-prof@hbcrm.local';
  const sub1Email = 'test-sub1-prof@hbcrm.local';
  const m2Email = 'test-mgr2-prof@hbcrm.local';
  const sub2Email = 'test-sub2-prof@hbcrm.local';

  await cleanupTestData([sub1Email, sub2Email, m1Email, m2Email]);

  const manager1 = await prisma.user.create({
    data: {
      name: 'Manager One',
      email: m1Email,
      passwordHash,
      role: Role.MANAGER,
    },
  });

  const subordinate1 = await prisma.user.create({
    data: {
      name: 'Subordinate One',
      email: sub1Email,
      passwordHash,
      role: Role.EMPLOYEE,
      supervisorId: manager1.id,
    },
  });

  const manager2 = await prisma.user.create({
    data: {
      name: 'Manager Two',
      email: m2Email,
      passwordHash,
      role: Role.MANAGER,
    },
  });

  const subordinate2 = await prisma.user.create({
    data: {
      name: 'Subordinate Two',
      email: sub2Email,
      passwordHash,
      role: Role.EMPLOYEE,
      supervisorId: manager2.id,
    },
  });

  // Seed sample customer, enquiry and follow-up for subordinate 1
  const customer1 = await prisma.customer.create({
    data: {
      name: 'Sub1 Test Customer',
      phone: '+919876543210',
      companyName: 'Acme Sub1 Corp',
      assignedToId: subordinate1.id,
    },
  });

  const enquiry1 = await prisma.enquiry.create({
    data: {
      customer: { connect: { id: customer1.id } },
      createdBy: { connect: { id: manager1.id } },
      phone: customer1.phone,
      source: 'WEBSITE',
      status: EnquiryStatus.FOLLOW_UP_REQUIRED,
      priority: Priority.HIGH,
      assignedTo: { connect: { id: subordinate1.id } },
    },
  });

  await prisma.followup.create({
    data: {
      enquiry: { connect: { id: enquiry1.id } },
      customer: { connect: { id: customer1.id } },
      assignedTo: { connect: { id: subordinate1.id } },
      dueAt: new Date(),
      status: FollowupStatus.PENDING,
      purpose: 'Discuss quotation',
    },
  });

  // Log in actors
  const { token: m1Token } = await loginUser(m1Email, 'TestPassword123!');
  const { token: sub1Token } = await loginUser(sub1Email, 'TestPassword123!');
  const { token: adminToken } = await loginUser(adminEmail, 'AdminPassword123!');

  // Test 1: Manager 1 viewing own subordinate's profile returns 200 OK
  const m1ViewsSub1Res = await fetch(`${API_BASE}/users/${subordinate1.id}/profile`, {
    headers: { Authorization: `Bearer ${m1Token}` },
  });
  report('1.1 Manager 1 viewing own subordinate returns 200 OK', m1ViewsSub1Res.status === 200);

  const m1ViewsSub1Data = (await m1ViewsSub1Res.json()) as {
    status: string;
    data: {
      user: { id: string; name: string; email: string; supervisorId: string | null };
      countsByStatus: Record<string, number>;
      followups: { dueToday: number; overdue: number };
      assignedCount: number;
    };
  };
  report('1.2 Response status is success', m1ViewsSub1Data.status === 'success');
  report('1.3 Response user ID matches subordinate 1', m1ViewsSub1Data.data.user.id === subordinate1.id);
  report('1.4 Enquiry stats reflect subordinate enquiries', m1ViewsSub1Data.data.assignedCount >= 1);
  report('1.5 Status breakdown contains FOLLOW_UP_REQUIRED >= 1', m1ViewsSub1Data.data.countsByStatus['FOLLOW_UP_REQUIRED'] >= 1);
  report('1.6 Follow-ups due today count is tracked', m1ViewsSub1Data.data.followups.dueToday >= 1);

  // Test 2: Anti-Enumeration: Manager 1 attempting to view Manager 2's subordinate returns 404 NOT FOUND (never 403)
  const m1ViewsSub2Res = await fetch(`${API_BASE}/users/${subordinate2.id}/profile`, {
    headers: { Authorization: `Bearer ${m1Token}` },
  });
  report('2.1 Manager 1 viewing out-of-tree subordinate returns 404 Not Found (Anti-Enumeration)', m1ViewsSub2Res.status === 404);
  const m1ViewsSub2Data = (await m1ViewsSub2Res.json()) as { message?: string };
  report('2.2 Error message does not leak user existence ("User not found.")', m1ViewsSub2Data.message === 'User not found.');

  // Test 3: Manager 1 viewing non-existent user returns 404 NOT FOUND
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const m1ViewsFakeRes = await fetch(`${API_BASE}/users/${fakeId}/profile`, {
    headers: { Authorization: `Bearer ${m1Token}` },
  });
  report('3. Manager 1 viewing non-existent user ID returns 404 Not Found', m1ViewsFakeRes.status === 404);

  // Test 4: Regular Employee calling GET /users/:id/profile is rejected with 403 Forbidden
  const empViewsSub2Res = await fetch(`${API_BASE}/users/${subordinate2.id}/profile`, {
    headers: { Authorization: `Bearer ${sub1Token}` },
  });
  report('4. Regular Employee calling profile endpoint is rejected with 403 Forbidden', empViewsSub2Res.status === 403);

  // Test 5: Regular Employee calling profile endpoint for own ID is rejected with 403 Forbidden (Manager+ only route)
  const empViewsSelfRes = await fetch(`${API_BASE}/users/${subordinate1.id}/profile`, {
    headers: { Authorization: `Bearer ${sub1Token}` },
  });
  report('5. Regular Employee calling own profile via Manager+ route is rejected with 403 Forbidden', empViewsSelfRes.status === 403);

  // Test 6: Manager 1 can view own profile (200 OK)
  const m1ViewsSelfRes = await fetch(`${API_BASE}/users/${manager1.id}/profile`, {
    headers: { Authorization: `Bearer ${m1Token}` },
  });
  report('6. Manager 1 can view own profile (200 OK)', m1ViewsSelfRes.status === 200);

  // Test 7: Admin can view any subordinate profile (200 OK)
  const adminViewsSub1Res = await fetch(`${API_BASE}/users/${subordinate1.id}/profile`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  report('7.1 Admin viewing subordinate 1 returns 200 OK', adminViewsSub1Res.status === 200);

  const adminViewsSub2Res = await fetch(`${API_BASE}/users/${subordinate2.id}/profile`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  report('7.2 Admin viewing subordinate 2 returns 200 OK', adminViewsSub2Res.status === 200);

  // Clean up test data
  try {
    await cleanupTestData([sub1Email, sub2Email, m1Email, m2Email]);
  } catch (e) {
    console.warn('Cleanup warning:', e);
  }

  console.log('\n===========================================================');
  console.log(`TEST RESULTS: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('===========================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
