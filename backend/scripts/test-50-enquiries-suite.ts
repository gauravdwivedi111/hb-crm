import dotenv from 'dotenv';
import path from 'path';
import { EnquiryStatus, Priority } from '@prisma/client';
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

async function login(email: string, password: string): Promise<string> {
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
  return json.data.accessToken;
}

async function runTestSuite() {
  console.log('\n===========================================================');
  console.log('   COMPREHENSIVE 50-ENQUIRY & ALL-FEATURES TEST SUITE');
  console.log('===========================================================');
  console.log(`Target Backend: ${API_BASE}\n`);

  // 1. Authenticate test actors
  console.log('🔑 Authenticating organizational roles...');
  const adminToken = await login('admin@hbcrm.local', 'AdminPassword123!');
  const rajeshToken = await login('rajesh.verma@hbcrm.local', 'Password123!');
  const priyaToken = await login('priya.sharma@hbcrm.local', 'Password123!');
  const vikramToken = await login('vikram.singh@hbcrm.local', 'Password123!');

  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [
          'admin@hbcrm.local',
          'rajesh.verma@hbcrm.local',
          'priya.sharma@hbcrm.local',
          'amit.patel@hbcrm.local',
          'vikram.singh@hbcrm.local',
          'sneha.reddy@hbcrm.local',
        ],
      },
    },
    select: { id: true, email: true, name: true },
  });

  const priyaUser = users.find((u) => u.email === 'priya.sharma@hbcrm.local');
  const snehaUser = users.find((u) => u.email === 'sneha.reddy@hbcrm.local');

  if (!priyaUser || !snehaUser) {
    throw new Error('Required seed users not found in database. Run npm run seed:50 first.');
  }

  // -------------------------------------------------------------
  // Test 1: Enquiry List & Pagination
  // -------------------------------------------------------------
  console.log('\n--- 1. ENQUIRY LISTING & PAGINATION ---');
  const page1Res = await fetch(`${API_BASE}/enquiries?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  report('1.1 Admin fetches page 1 with limit 10 returns 200 OK', page1Res.status === 200);

  const page1Data = (await page1Res.json()) as {
    data: { enquiries: Array<{ id: string; status: string }>; meta: { total: number; page: number; totalPages: number } };
  };
  report('1.2 Total enquiries in database is at least 50', page1Data.data.meta.total >= 50, `Found: ${page1Data.data.meta.total}`);
  report('1.3 Page 1 contains exactly 10 enquiries', page1Data.data.enquiries.length === 10);
  report('1.4 Total pages is at least 5', page1Data.data.meta.totalPages >= 5);

  const page2Res = await fetch(`${API_BASE}/enquiries?page=2&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const page2Data = (await page2Res.json()) as {
    data: { enquiries: Array<{ id: string }> };
  };
  const page1Ids = new Set(page1Data.data.enquiries.map((e) => e.id));
  const page2Ids = page2Data.data.enquiries.map((e) => e.id);
  const overlap = page2Ids.some((id) => page1Ids.has(id));
  report('1.5 Page 2 returns 10 distinct enquiries without overlap', !overlap && page2Ids.length === 10);

  // -------------------------------------------------------------
  // Test 2: All 9 Enquiry Status Filters
  // -------------------------------------------------------------
  console.log('\n--- 2. ALL 9 STATUS FILTERS ---');
  const allStatuses: EnquiryStatus[] = [
    'NEW',
    'ASSIGNED',
    'CONTACTED',
    'FOLLOW_UP_REQUIRED',
    'QUOTATION_SENT',
    'NEGOTIATION',
    'CONVERTED',
    'LOST',
    'ON_HOLD',
  ];

  for (const st of allStatuses) {
    const stRes = await fetch(`${API_BASE}/enquiries?status=${st}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const stData = (await stRes.json()) as {
      data: { enquiries: Array<{ status: string }>; meta: { total: number } };
    };
    const allMatch = stData.data.enquiries.every((e) => e.status === st);
    report(
      `2.${allStatuses.indexOf(st) + 1} Status filter [${st}] returns matching records`,
      stRes.status === 200 && allMatch && stData.data.meta.total > 0,
      `Count: ${stData.data.meta.total}`,
    );
  }

  // -------------------------------------------------------------
  // Test 3: Priority Filters (HIGH, MEDIUM, LOW)
  // -------------------------------------------------------------
  console.log('\n--- 3. PRIORITY FILTERS ---');
  const allPriorities: Priority[] = ['HIGH', 'MEDIUM', 'LOW'];
  for (const prio of allPriorities) {
    const pRes = await fetch(`${API_BASE}/enquiries?priority=${prio}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const pData = (await pRes.json()) as {
      data: { enquiries: Array<{ priority: string }>; meta: { total: number } };
    };
    const allMatch = pData.data.enquiries.every((e) => e.priority === prio);
    report(
      `3.${allPriorities.indexOf(prio) + 1} Priority filter [${prio}] returns matching records`,
      pRes.status === 200 && allMatch && pData.data.meta.total > 0,
      `Count: ${pData.data.meta.total}`,
    );
  }

  // -------------------------------------------------------------
  // Test 4: Search Across Multiple Entity Fields
  // -------------------------------------------------------------
  console.log('\n--- 4. SEARCH FUNCTIONALITY ---');
  // 4.1 Search by Customer Name
  const searchNameRes = await fetch(`${API_BASE}/search?q=Birla`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const searchNameData = (await searchNameRes.json()) as { data: Array<{ title: string; type: string }> };
  const foundCustomer = searchNameData.data.some((item) => item.title.includes('Birla'));
  report('4.1 Global search by Customer Name ("Birla") finds record', foundCustomer);

  // 4.2 Search by Phone
  const searchPhoneRes = await fetch(`${API_BASE}/search?q=9811000101`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const searchPhoneData = (await searchPhoneRes.json()) as { data: Array<{ phone?: string }> };
  const foundPhone = searchPhoneData.data.some((item) => item.phone?.includes('9811000101'));
  report('4.2 Global search by Phone Number ("9811000101") finds record', foundPhone);

  // 4.3 Search by Product on Enquiries
  const searchProdRes = await fetch(`${API_BASE}/enquiries?search=Cybersecurity`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const searchProdData = (await searchProdRes.json()) as { data: { enquiries: Array<{ product?: string }> } };
  const foundProd = searchProdData.data.enquiries.every((e) => e.product?.includes('Cybersecurity'));
  report('4.3 Enquiry search by Product ("Cybersecurity") filters list accurately', searchProdData.data.enquiries.length > 0 && foundProd);

  // -------------------------------------------------------------
  // Test 5: Hierarchical Access Scoping
  // -------------------------------------------------------------
  console.log('\n--- 5. HIERARCHICAL ACCESS SCOPING ---');
  // 5.1 Admin sees all enquiries
  const adminAllRes = await fetch(`${API_BASE}/enquiries?limit=100`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminAllData = (await adminAllRes.json()) as { data: { meta: { total: number } } };
  report('5.1 Admin has full visibility of all enquiries', adminAllData.data.meta.total >= 50);

  // 5.2 Manager 1 (Rajesh) sees his own + Priya's + Amit's + unassigned, but NOT Sneha's
  const rajeshListRes = await fetch(`${API_BASE}/enquiries?limit=100`, {
    headers: { Authorization: `Bearer ${rajeshToken}` },
  });
  const rajeshListData = (await rajeshListRes.json()) as {
    data: { enquiries: Array<{ assignedToId: string | null }>; meta: { total: number } };
  };
  const containsSnehaEnquiry = rajeshListData.data.enquiries.some((e) => e.assignedToId === snehaUser.id);
  report('5.2 Manager 1 sees own team and unassigned enquiries', rajeshListData.data.meta.total > 0);
  report('5.3 Manager 1 does NOT see Manager 2 subordinate (Sneha) enquiries', !containsSnehaEnquiry);

  // 5.3 Employee 1A (Priya) strictly sees only her own enquiries
  const priyaListRes = await fetch(`${API_BASE}/enquiries?limit=100`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  const priyaListData = (await priyaListRes.json()) as {
    data: { enquiries: Array<{ assignedToId: string | null }> };
  };
  const priyaAllOwn = priyaListData.data.enquiries.every((e) => e.assignedToId === priyaUser.id);
  report('5.4 Employee strictly sees ONLY their own assigned enquiries', priyaListData.data.enquiries.length > 0 && priyaAllOwn);

  // -------------------------------------------------------------
  // Test 6: Personal Dashboard KPIs
  // -------------------------------------------------------------
  console.log('\n--- 6. DASHBOARD KPIS (ME) ---');
  const priyaDashRes = await fetch(`${API_BASE}/dashboard/me`, {
    headers: { Authorization: `Bearer ${priyaToken}` },
  });
  report('6.1 Priya calls GET /dashboard/me returns 200 OK', priyaDashRes.status === 200);

  const priyaDash = (await priyaDashRes.json()) as {
    data: {
      followups: { dueToday: number; overdue: number };
      quotationsPendingResponse: number;
      countsByStatus: Record<string, number>;
      recentlyContactedCustomers: Array<unknown>;
    };
  };
  report('6.2 Priya has Due Today follow-ups tracked', priyaDash.data.followups.dueToday >= 1, `Count: ${priyaDash.data.followups.dueToday}`);
  report('6.3 Priya has Overdue follow-ups tracked', priyaDash.data.followups.overdue >= 1, `Count: ${priyaDash.data.followups.overdue}`);
  report('6.4 Priya has Pending Quotations tracked', priyaDash.data.quotationsPendingResponse >= 1, `Count: ${priyaDash.data.quotationsPendingResponse}`);
  report('6.5 Recently contacted customers list is populated', priyaDash.data.recentlyContactedCustomers.length > 0);

  // -------------------------------------------------------------
  // Test 7: Team Dashboard (Manager+)
  // -------------------------------------------------------------
  console.log('\n--- 7. TEAM DASHBOARD ---');
  const teamDashRes = await fetch(`${API_BASE}/dashboard/team`, {
    headers: { Authorization: `Bearer ${rajeshToken}` },
  });
  report('7.1 Manager 1 calls GET /dashboard/team returns 200 OK', teamDashRes.status === 200);

  const teamDashJson = (await teamDashRes.json()) as {
    data: Array<{
      user: { id: string; name: string };
      assignedCount: number;
      overdueCount: number;
      conversionRateThisMonth: number;
    }>;
  };
  const teamList = teamDashJson.data;
  const priyaInTeam = teamList.find((m) => m.user.id === priyaUser.id);
  report('7.2 Manager 1 team breakdown includes Priya Sharma', !!priyaInTeam);
  report('7.3 Priya has assigned enquiries and metrics in team dashboard', !!priyaInTeam && priyaInTeam.assignedCount > 0);
  report('7.4 Sneha (Manager 2 subordinate) is NOT present in Manager 1 team dashboard', !teamList.some((m) => m.user.id === snehaUser.id));

  // -------------------------------------------------------------
  // Test 8: Employee Profile Page Endpoint & Anti-Enumeration
  // -------------------------------------------------------------
  console.log('\n--- 8. EMPLOYEE PROFILE & ANTI-ENUMERATION ---');
  const priyaProfRes = await fetch(`${API_BASE}/users/${priyaUser.id}/profile`, {
    headers: { Authorization: `Bearer ${rajeshToken}` },
  });
  report('8.1 Manager 1 viewing Priya profile returns 200 OK', priyaProfRes.status === 200);

  const priyaProf = (await priyaProfRes.json()) as {
    data: {
      user: { name: string; email: string };
      assignedCount: number;
      conversionRateThisMonth: number;
      followups: { dueToday: number; overdue: number };
    };
  };
  report('8.2 Profile data contains Priya details and live stats', priyaProf.data.user.email === priyaUser.email && priyaProf.data.assignedCount > 0);

  // Anti-enumeration: Manager 1 viewing Sneha (Manager 2's subordinate) -> 404
  const snehaProfRes = await fetch(`${API_BASE}/users/${snehaUser.id}/profile`, {
    headers: { Authorization: `Bearer ${rajeshToken}` },
  });
  report('8.3 Anti-Enumeration: Manager 1 viewing Sneha returns 404 Not Found (never 403)', snehaProfRes.status === 404);

  // -------------------------------------------------------------
  // Test 9: Enquiry Detail with All Attached Features
  // -------------------------------------------------------------
  console.log('\n--- 9. ENQUIRY DETAIL COMPLETE FEATURES ---');
  // Find an enquiry with quotation and attachment
  const richEnquiry = await prisma.enquiry.findFirst({
    where: {
      quotations: { some: {} },
      attachments: { some: {} },
    },
    select: { id: true },
  });

  if (richEnquiry) {
    const detailRes = await fetch(`${API_BASE}/enquiries/${richEnquiry.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    report('9.1 GET /enquiries/:id returns 200 OK', detailRes.status === 200);

    const detailData = (await detailRes.json()) as {
      data: {
        enquiry: {
          customer: { name: string; phone: string };
          quotations: Array<{ status: string; amount: string | number }>;
          attachments: Array<{ fileName: string; fileSize: number }>;
          activities: Array<{ type: string; description: string }>;
        };
      };
    };
    report('9.2 Enquiry detail has Customer relation populated', !!detailData.data.enquiry.customer.name);
    report('9.3 Enquiry detail has Quotations populated', detailData.data.enquiry.quotations.length > 0);
    report('9.4 Enquiry detail has Attachments populated with file metadata', detailData.data.enquiry.attachments.length > 0);
    report('9.5 Enquiry detail has Activity Timeline populated', detailData.data.enquiry.activities.length > 0);
  }

  // -------------------------------------------------------------
  // Test 10: Performance Reports
  // -------------------------------------------------------------
  console.log('\n--- 10. PERFORMANCE REPORTS ---');
  const perfRes = await fetch(`${API_BASE}/reports/performance`, {
    headers: { Authorization: `Bearer ${rajeshToken}` },
  });
  report('10.1 Manager 1 calls GET /reports/performance returns 200 OK', perfRes.status === 200);
  const perfData = (await perfRes.json()) as {
    data: Array<{ user: { id: string }; enquiriesAssigned: number }>;
  };
  report('10.2 Performance report aggregates metrics across team', perfData.data.length > 0);

  console.log('\n===========================================================');
  console.log(`TEST RESULTS: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('===========================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch((e) => {
    console.error('Fatal test runner error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
