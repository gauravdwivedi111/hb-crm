import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { Role, EnquiryStatus, FollowupStatus, QuotationStatus } from '@prisma/client';
import { prisma } from '../src/prisma/client.js';

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
  console.info('   CRM DASHBOARD, REPORTING & SCOPED SEARCH TEST SUITE     ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  // Verify DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error('\x1b[31m[ERROR] Unable to connect to the PostgreSQL database.\x1b[0m');
    console.error('Please ensure your database is running: npx prisma migrate deploy\n');
    process.exit(1);
  }

  console.info('🔧 Setting up test actors...');
  const testPasswordHash = await argon2.hash('TestPass12345!', { type: argon2.argon2id });

  // 1. Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'test_admin_dash@crm.internal' },
    update: { isActive: true },
    create: {
      name: 'Admin Dashboard Tester',
      email: 'test_admin_dash@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.ADMIN,
    },
  });

  // 2. Manager 1
  const managerUser1 = await prisma.user.upsert({
    where: { email: 'test_mgr1_dash@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id },
    create: {
      name: 'Manager 1 Dashboard Tester',
      email: 'test_mgr1_dash@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.MANAGER,
      supervisorId: adminUser.id,
    },
  });

  // 3. Employee A (under Manager 1)
  const employeeUserA = await prisma.user.upsert({
    where: { email: 'test_emp_a_dash@crm.internal' },
    update: { isActive: true, supervisorId: managerUser1.id },
    create: {
      name: 'Employee A Dashboard Tester',
      email: 'test_emp_a_dash@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
      supervisorId: managerUser1.id,
    },
  });

  // 4. Manager 2 (Separate supervisory tree)
  const managerUser2 = await prisma.user.upsert({
    where: { email: 'test_mgr2_dash@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id },
    create: {
      name: 'Manager 2 Dashboard Tester',
      email: 'test_mgr2_dash@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.MANAGER,
      supervisorId: adminUser.id,
    },
  });

  // Obtain tokens
  const adminToken = await loginUser('test_admin_dash@crm.internal', 'TestPass12345!');
  const mgr1Token = await loginUser('test_mgr1_dash@crm.internal', 'TestPass12345!');
  const mgr2Token = await loginUser('test_mgr2_dash@crm.internal', 'TestPass12345!');
  const empAToken = await loginUser('test_emp_a_dash@crm.internal', 'TestPass12345!');

  console.info('🌱 Seeding deterministic test dataset for Employee A...');

  // Clean old test data for this employee
  await prisma.quotation.deleteMany({
    where: { createdById: employeeUserA.id },
  });
  await prisma.followup.deleteMany({
    where: { assignedToId: employeeUserA.id },
  });
  await prisma.enquiry.deleteMany({
    where: { assignedToId: employeeUserA.id },
  });
  await prisma.customer.deleteMany({
    where: { assignedToId: employeeUserA.id },
  });

  const now = new Date();
  const nowIST = DateTime.now().setZone('Asia/Kolkata');
  const endOfDay = nowIST.endOf('day').minus({ seconds: 30 }).toJSDate();

  // 1. Customers
  const customerAlpha = await prisma.customer.create({
    data: {
      name: 'Cust Alpha Apex',
      companyName: 'Alpha Solar Corp',
      phone: '+919811122233',
      email: 'alpha@apexcorp.example',
      location: 'Ahmedabad, GJ',
      assignedToId: employeeUserA.id,
    },
  });

  const customerBeta = await prisma.customer.create({
    data: {
      name: 'Cust Beta Energy',
      companyName: 'Beta Energy Ltd',
      phone: '+919844455566',
      email: 'contact@betaenergy.example',
      location: 'Surat, GJ',
      assignedToId: employeeUserA.id,
    },
  });

  // 2. Three Enquiries in different statuses
  // Enquiry 1: NEW, not contacted
  const enquiry1 = await prisma.enquiry.create({
    data: {
      customerId: customerAlpha.id,
      companyName: 'Alpha Solar Corp',
      phone: customerAlpha.phone,
      product: '50kW Rooftop System',
      status: EnquiryStatus.NEW,
      assignedToId: employeeUserA.id,
      createdById: employeeUserA.id,
      lastContactedAt: null,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
  });

  // Enquiry 2: CONTACTED, contacted 1 hour ago
  const enquiry2 = await prisma.enquiry.create({
    data: {
      customerId: customerBeta.id,
      companyName: 'Beta Energy Ltd',
      phone: customerBeta.phone,
      product: '100kW Industrial Plant',
      status: EnquiryStatus.CONTACTED,
      assignedToId: employeeUserA.id,
      createdById: employeeUserA.id,
      lastContactedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    },
  });

  // Enquiry 3: CONVERTED, contacted 5 hours ago, updated now
  const enquiry3 = await prisma.enquiry.create({
    data: {
      customerId: customerAlpha.id,
      companyName: 'Alpha Solar Corp Expansion',
      phone: customerAlpha.phone,
      product: '250kW Ground Mount',
      status: EnquiryStatus.CONVERTED,
      assignedToId: employeeUserA.id,
      createdById: employeeUserA.id,
      lastContactedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5 hours ago
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      updatedAt: now,
    },
  });

  // 3. Follow-ups
  // Overdue 1: status = OVERDUE
  await prisma.followup.create({
    data: {
      enquiryId: enquiry1.id,
      assignedToId: employeeUserA.id,
      dueAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      status: FollowupStatus.OVERDUE,
      purpose: 'Initial introduction call',
    },
  });

  // Overdue 2: status = PENDING but dueAt < now (yesterday)
  await prisma.followup.create({
    data: {
      enquiryId: enquiry2.id,
      assignedToId: employeeUserA.id,
      dueAt: new Date(now.getTime() - 26 * 60 * 60 * 1000), // 26 hours ago (yesterday)
      status: FollowupStatus.PENDING,
      purpose: 'Technical requirement review',
    },
  });

  // Due Today: status = PENDING and dueAt is later today
  await prisma.followup.create({
    data: {
      enquiryId: enquiry3.id,
      assignedToId: employeeUserA.id,
      dueAt: endOfDay,
      status: FollowupStatus.PENDING,
      purpose: 'Contract signing follow-up',
    },
  });

  // Completed follow-up (yesterday)
  await prisma.followup.create({
    data: {
      enquiryId: enquiry2.id,
      assignedToId: employeeUserA.id,
      dueAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 20 * 60 * 60 * 1000),
      status: FollowupStatus.COMPLETED,
      purpose: 'Sent brochure',
    },
  });

  // 4. Quotations
  // Quotation 1: SENT, no response yet (PENDING RESPONSE)
  await prisma.quotation.create({
    data: {
      enquiryId: enquiry2.id,
      createdById: employeeUserA.id,
      status: QuotationStatus.SENT,
      amount: 1250000.0,
      sentAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
      respondedAt: null,
    },
  });

  // Quotation 2: ACCEPTED (responded, not pending)
  await prisma.quotation.create({
    data: {
      enquiryId: enquiry3.id,
      createdById: employeeUserA.id,
      status: QuotationStatus.ACCEPTED,
      amount: 3200000.0,
      sentAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      respondedAt: now,
    },
  });

  console.info('Test dataset seeded successfully.\n');

  // =========================================================================
  // TEST 1: GET /dashboard/me (Personal Dashboard Exact Aggregations)
  // =========================================================================
  console.info('👉 TEST 1: GET /dashboard/me (Exact Numerical Verification)');
  try {
    const res = await fetch(`${API_BASE}/dashboard/me`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });

    const json = (await res.json()) as {
      status: string;
      data: {
        countsByStatus: Record<string, number>;
        followups: { dueToday: number; overdue: number };
        quotationsPendingResponse: number;
        performanceThisMonth: { converted: number; lost: number };
        recentlyContactedCustomers: Array<{ customerId: string; customerName: string; lastContactedAt: string }>;
      };
    };

    const d = json.data;

    report(
      '1.1 Response status is 200 OK',
      res.status === 200,
      `Status: ${res.status}`,
    );

    report(
      '1.2 Exact status counts match seeded data (NEW: 1, CONTACTED: 1, CONVERTED: 1, LOST: 0)',
      d.countsByStatus.NEW === 1 &&
        d.countsByStatus.CONTACTED === 1 &&
        d.countsByStatus.CONVERTED === 1 &&
        d.countsByStatus.LOST === 0,
      `NEW: ${d.countsByStatus.NEW}, CONTACTED: ${d.countsByStatus.CONTACTED}, CONVERTED: ${d.countsByStatus.CONVERTED}`,
    );

    report(
      '1.3 Follow-ups counts match seeded data (overdue: 2, dueToday: 1)',
      d.followups.overdue === 2 && d.followups.dueToday === 1,
      `Overdue: ${d.followups.overdue} (expected 2), DueToday: ${d.followups.dueToday} (expected 1)`,
    );

    report(
      '1.4 Quotations pending response matches seeded count (1 pending)',
      d.quotationsPendingResponse === 1,
      `Pending: ${d.quotationsPendingResponse} (expected 1)`,
    );

    report(
      '1.5 Monthly performance counts match (converted: 1, lost: 0)',
      d.performanceThisMonth.converted === 1 && d.performanceThisMonth.lost === 0,
      `Converted: ${d.performanceThisMonth.converted}, Lost: ${d.performanceThisMonth.lost}`,
    );

    report(
      '1.6 Recently contacted customers returned and sorted descending (Enquiry 2 before Enquiry 3)',
      d.recentlyContactedCustomers.length === 2 &&
        d.recentlyContactedCustomers[0].customerName === 'Cust Beta Energy',
      `Count: ${d.recentlyContactedCustomers.length}, Top: ${d.recentlyContactedCustomers[0]?.customerName}`,
    );

    // 1.7 IST Timezone Day Boundary Verification
    // Seed follow-up due at 11:45 PM IST today, and one at 12:15 AM IST next day
    const nowIST = DateTime.now().setZone('Asia/Kolkata');
    const dueAt1145PM_IST = nowIST
      .startOf('day')
      .set({ hour: 23, minute: 45, second: 0, millisecond: 0 })
      .toJSDate();
    const dueAt1215AM_NextDay_IST = nowIST
      .plus({ days: 1 })
      .startOf('day')
      .set({ hour: 0, minute: 15, second: 0, millisecond: 0 })
      .toJSDate();

    // Create both follow-ups
    const f1145 = await prisma.followup.create({
      data: {
        enquiryId: enquiry1.id,
        assignedToId: employeeUserA.id,
        dueAt: dueAt1145PM_IST,
        status: FollowupStatus.PENDING,
        purpose: '11:45 PM IST Follow-up (Should be in dueToday)',
      },
    });

    const f1215 = await prisma.followup.create({
      data: {
        enquiryId: enquiry1.id,
        assignedToId: employeeUserA.id,
        dueAt: dueAt1215AM_NextDay_IST,
        status: FollowupStatus.PENDING,
        purpose: '12:15 AM IST Next Day Follow-up (Should NOT be in dueToday)',
      },
    });

    const tzRes = await fetch(`${API_BASE}/dashboard/me`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });
    const tzJson = (await tzRes.json()) as {
      data: { followups: { dueToday: number } };
    };

    // Baseline dueToday was 1 (from Enquiry 3). With f1145 added, it should be 2.
    // f1215 is in tomorrow's bucket and must NOT be in dueToday.
    const isDueTodayAccurate = tzJson.data?.followups?.dueToday === 2;

    report(
      '1.7 IST Day Boundary: Follow-up at 11:45 PM IST lands in dueToday; 12:15 AM IST next day is excluded',
      isDueTodayAccurate,
      `Expected dueToday = 2, Actual = ${tzJson.data?.followups?.dueToday} (11:45PM IST UTC=${dueAt1145PM_IST.toISOString()}, 12:15AM IST UTC=${dueAt1215AM_NextDay_IST.toISOString()})`,
    );

    // Clean up temporary boundary follow-ups
    await prisma.followup.deleteMany({
      where: { id: { in: [f1145.id, f1215.id] } },
    });
  } catch (err) {
    report('1. GET /dashboard/me', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 2: GET /dashboard/team (Manager+ Team Breakdown)
  // =========================================================================
  console.info('\n👉 TEST 2: GET /dashboard/team (Team Aggregations & Access Scoping)');
  try {
    // 2.1 Employee calling /dashboard/team gets 403
    const empTeamRes = await fetch(`${API_BASE}/dashboard/team`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });
    report(
      '2.1 Employee calling /dashboard/team is rejected with 403 Forbidden',
      empTeamRes.status === 403,
      `Status: ${empTeamRes.status}`,
    );

    // 2.2 Manager 1 calling /dashboard/team gets 200 OK and Employee A's metrics
    const mgrTeamRes = await fetch(`${API_BASE}/dashboard/team`, {
      headers: { Authorization: `Bearer ${mgr1Token}` },
    });
    const mgrTeamJson = (await mgrTeamRes.json()) as {
      status: string;
      data: Array<{
        user: { id: string; name: string };
        assignedCount: number;
        contactedCount: number;
        overdueCount: number;
        convertedThisMonth: number;
        conversionRateThisMonth: number;
      }>;
    };

    const empAMetrics = mgrTeamJson.data?.find((m) => m.user.id === employeeUserA.id);

    report(
      '2.2 Manager 1 sees team breakdown with Employee A metrics (assigned: 3, contacted: 2, overdue: 2, converted: 1, rate: 33.33%)',
      mgrTeamRes.status === 200 &&
        Boolean(empAMetrics) &&
        empAMetrics?.assignedCount === 3 &&
        empAMetrics?.contactedCount === 2 &&
        empAMetrics?.overdueCount === 2 &&
        empAMetrics?.convertedThisMonth === 1 &&
        empAMetrics?.conversionRateThisMonth === 33.33,
      `Assigned: ${empAMetrics?.assignedCount}, Contacted: ${empAMetrics?.contactedCount}, Overdue: ${empAMetrics?.overdueCount}, Rate: ${empAMetrics?.conversionRateThisMonth}%`,
    );

    // 2.3 Manager 2 (separate tree) does NOT see Employee A in their team
    const mgr2TeamRes = await fetch(`${API_BASE}/dashboard/team`, {
      headers: { Authorization: `Bearer ${mgr2Token}` },
    });
    const mgr2TeamJson = (await mgr2TeamRes.json()) as {
      data: Array<{ user: { id: string } }>;
    };
    const empAInMgr2 = mgr2TeamJson.data?.some((m) => m.user.id === employeeUserA.id);

    report(
      '2.3 Manager 2 (separate tree) does NOT see Employee A in their team dashboard',
      mgr2TeamRes.status === 200 && !empAInMgr2,
      `Found Employee A in Manager 2 team: ${Boolean(empAInMgr2)}`,
    );
  } catch (err) {
    report('2. GET /dashboard/team', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 3: GET /reports/performance (Manager+ Performance Reporting)
  // =========================================================================
  console.info('\n👉 TEST 3: GET /reports/performance (Metrics, Averages & Scoping)');
  try {
    // 3.1 Employee calling /reports/performance gets 403
    const empRepRes = await fetch(`${API_BASE}/reports/performance`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });
    report(
      '3.1 Employee calling /reports/performance is rejected with 403 Forbidden',
      empRepRes.status === 403,
      `Status: ${empRepRes.status}`,
    );

    // 3.2 Manager 1 calling for Employee A gets accurate stats
    const startStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endStr = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

    const repRes = await fetch(
      `${API_BASE}/reports/performance?userId=${employeeUserA.id}&startDate=${startStr}&endDate=${endStr}`,
      { headers: { Authorization: `Bearer ${mgr1Token}` } },
    );

    const repJson = (await repRes.json()) as {
      status: string;
      data: Array<{
        user: { id: string };
        enquiriesAssigned: number;
        contacted: number;
        followupsCompleted: number;
        followupsMissed: number;
        quotationsSent: number;
        converted: number;
        lost: number;
        conversionRate: number;
        avgTimeToFirstContactHours: number | null;
        avgTimeToConversionHours: number | null;
      }>;
    };

    const metrics = repJson.data?.[0];

    report(
      '3.2 Performance report computes exact numbers for Employee A (assigned: 3, completed: 1, missed: 2, quotationsSent: 2, converted: 1, rate: 33.33%)',
      repRes.status === 200 &&
        metrics?.enquiriesAssigned === 3 &&
        metrics?.contacted === 2 &&
        metrics?.followupsCompleted === 1 &&
        metrics?.followupsMissed === 2 &&
        metrics?.quotationsSent === 2 &&
        metrics?.converted === 1 &&
        metrics?.conversionRate === 33.33 &&
        typeof metrics?.avgTimeToFirstContactHours === 'number' &&
        typeof metrics?.avgTimeToConversionHours === 'number',
      `Assigned: ${metrics?.enquiriesAssigned}, Completed: ${metrics?.followupsCompleted}, Missed: ${metrics?.followupsMissed}, QuotationsSent: ${metrics?.quotationsSent}, AvgContactHrs: ${metrics?.avgTimeToFirstContactHours}, AvgConvHrs: ${metrics?.avgTimeToConversionHours}`,
    );

    // 3.3 Manager 2 calling for Employee A gets 404 Not Found (anti-enumeration)
    const mgr2RepRes = await fetch(
      `${API_BASE}/reports/performance?userId=${employeeUserA.id}`,
      { headers: { Authorization: `Bearer ${mgr2Token}` } },
    );
    report(
      '3.3 Manager 2 requesting Employee A metrics receives 404 Not Found (anti-enumeration)',
      mgr2RepRes.status === 404,
      `Status: ${mgr2RepRes.status}`,
    );
  } catch (err) {
    report('3. GET /reports/performance', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 4: GET /search (Scoped Unified Search & Relevance Ranking)
  // =========================================================================
  console.info('\n👉 TEST 4: GET /search (Relevance Ranking & Access Scoping)');
  try {
    // 4.1 Exact phone search returns Customer Alpha with top score
    const phoneSearchRes = await fetch(`${API_BASE}/search?q=+919811122233`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });
    const phoneSearchJson = (await phoneSearchRes.json()) as {
      status: string;
      data: Array<{ title: string; phone: string; score: number; type: string }>;
    };

    const topItem = phoneSearchJson.data?.[0];

    report(
      '4.1 Phone search returns Customer Alpha with top relevance score',
      phoneSearchRes.status === 200 &&
        phoneSearchJson.data?.length >= 1 &&
        topItem?.phone === '+919811122233' &&
        topItem?.score === 100,
      `Count: ${phoneSearchJson.data?.length}, Top Title: ${topItem?.title}, Score: ${topItem?.score}`,
    );

    // 4.2 Product keyword search returns matching Enquiry
    const productSearchRes = await fetch(`${API_BASE}/search?q=Industrial`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });
    const productSearchJson = (await productSearchRes.json()) as {
      data: Array<{ type: string; subtitle: string; title: string }>;
    };
    const foundEnquiry = productSearchJson.data?.some(
      (item) => item.type === 'ENQUIRY' && item.subtitle.includes('Industrial'),
    );

    report(
      '4.2 Product search finds matching Enquiry',
      productSearchRes.status === 200 && Boolean(foundEnquiry),
      `Found Enquiry: ${Boolean(foundEnquiry)}`,
    );

    // 4.3 Manager 2 (separate tree) cannot find Employee A's customer
    const mgr2SearchRes = await fetch(`${API_BASE}/search?q=Alpha%20Solar`, {
      headers: { Authorization: `Bearer ${mgr2Token}` },
    });
    const mgr2SearchJson = (await mgr2SearchRes.json()) as {
      data: Array<{ title: string }>;
    };
    const foundByMgr2 = mgr2SearchJson.data?.some((item) => item.title.includes('Alpha'));

    report(
      '4.3 Manager 2 search does NOT reveal Employee A entities (scoped access)',
      mgr2SearchRes.status === 200 && !foundByMgr2,
      `Found items for Manager 2: ${mgr2SearchJson.data?.length}`,
    );

    // 4.4 Admin search returns entities across all trees
    const adminSearchRes = await fetch(`${API_BASE}/search?q=Alpha%20Solar`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminSearchJson = (await adminSearchRes.json()) as {
      data: Array<{ title: string }>;
    };

    report(
      '4.4 Admin search finds entities across all teams',
      adminSearchRes.status === 200 && adminSearchJson.data?.length >= 1,
      `Admin found items: ${adminSearchJson.data?.length}`,
    );
  } catch (err) {
    report('4. GET /search', false, (err as Error).message);
  }

  // Cleanup
  console.info('\n🧹 Cleaning up test records...');
  try {
    await prisma.quotation.deleteMany({
      where: { createdById: employeeUserA.id },
    });
    await prisma.followup.deleteMany({
      where: { assignedToId: employeeUserA.id },
    });
    await prisma.enquiry.deleteMany({
      where: { assignedToId: employeeUserA.id },
    });
    await prisma.customer.deleteMany({
      where: { assignedToId: employeeUserA.id },
    });
  } catch (err) {
    console.warn('Note: Cleanup notice:', (err as Error).message);
  }

  console.info('\n===========================================================');
  console.info(`   RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.info('===========================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
