import dotenv from 'dotenv';
import path from 'path';
import { Role, EnquiryStatus, ActivityType } from '@prisma/client';
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

  const json = (await res.json()) as { data: { accessToken: string } };
  return json.data.accessToken;
}

async function runTests(): Promise<void> {
  console.info('===========================================================');
  console.info('   EMPLOYEE ENQUIRY FORWARDING & SYSTEM SETTINGS SUITE     ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  try {
    // 0. Authenticate test personas
    console.info('🔑 Authenticating organizational roles...');
    const adminToken = await loginUser('admin@hbcrm.local', 'AdminPassword123!');
    const managerToken = await loginUser('rajesh.verma@hbcrm.local', 'Password123!');
    const priyaToken = await loginUser('priya.sharma@hbcrm.local', 'Password123!');
    const amitToken = await loginUser('amit.patel@hbcrm.local', 'Password123!');

    const priyaUser = await prisma.user.findUnique({ where: { email: 'priya.sharma@hbcrm.local' } });
    const amitUser = await prisma.user.findUnique({ where: { email: 'amit.patel@hbcrm.local' } });
    const rajeshUser = await prisma.user.findUnique({ where: { email: 'rajesh.verma@hbcrm.local' } });
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@hbcrm.local' } });

    if (!priyaUser || !amitUser || !rajeshUser || !adminUser) {
      throw new Error('Required test users not found in database.');
    }

    const testTimestamp = Date.now();
    const testPhone = `9811${String(testTimestamp).slice(-6)}`;

    // Create a Customer and an Enquiry initially assigned to Priya
    const customer = await prisma.customer.create({
      data: {
        name: `Forwarding Test Customer ${testTimestamp}`,
        phone: testPhone,
        email: `fwd_${testTimestamp}@example.com`,
        companyName: 'Forwarding Corp',
        assignedToId: priyaUser.id,
      },
    });

    const enquiry = await prisma.enquiry.create({
      data: {
        customerId: customer.id,
        phone: testPhone,
        companyName: 'Forwarding Corp',
        product: 'Enterprise Cloud',
        source: 'DIRECT_CALL',
        status: EnquiryStatus.NEW,
        assignedToId: priyaUser.id,
        createdById: priyaUser.id,
      },
    });

    // Create initial Activity on Enquiry
    await prisma.activity.create({
      data: {
        enquiryId: enquiry.id,
        userId: priyaUser.id,
        type: ActivityType.ENQUIRY_ASSIGNED,
        description: `Initial assignment to ${priyaUser.name}`,
      },
    });

    // =========================================================================
    // 1. FLAG OFF: EMPLOYEE ATTEMPTING REASSIGNMENT GETS 403 FORBIDDEN
    // =========================================================================
    console.info('\n--- 1. FLAG OFF PERMISSION ENFORCEMENT ---');

    // Ensure system setting is set to false
    await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ allowEmployeeReassignment: false }),
    });

    const flagOffAttempt = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: amitUser.id }),
    });

    report(
      '1.1 With flag OFF, Employee attempting to reassign gets 403 Forbidden',
      flagOffAttempt.status === 403,
      `Status: ${flagOffAttempt.status}`,
    );

    // =========================================================================
    // 2. ADMIN SETTINGS ACCESS CONTROL (GET & PATCH /settings)
    // =========================================================================
    console.info('\n--- 2. ADMIN SETTINGS ACCESS CONTROL ---');

    const empGetSettings = await fetch(`${API_BASE}/settings`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${priyaToken}` },
    });
    report(
      '2.1 Employee calling GET /settings is rejected with 403 Forbidden',
      empGetSettings.status === 403,
      `Status: ${empGetSettings.status}`,
    );

    const empPatchSettings = await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ allowEmployeeReassignment: true }),
    });
    report(
      '2.2 Employee calling PATCH /settings is rejected with 403 Forbidden',
      empPatchSettings.status === 403,
      `Status: ${empPatchSettings.status}`,
    );

    const publicStatus = await fetch(`${API_BASE}/settings/forwarding-status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${priyaToken}` },
    });
    const publicStatusJson = (await publicStatus.json()) as { data: { allowEmployeeReassignment: boolean } };
    report(
      '2.3 Authenticated employee can access GET /settings/forwarding-status (200 OK)',
      publicStatus.status === 200 && publicStatusJson.data?.allowEmployeeReassignment === false,
      `Status: ${publicStatus.status}, Value: ${publicStatusJson.data?.allowEmployeeReassignment}`,
    );

    // Admin toggles flag ON
    const adminToggleOn = await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ allowEmployeeReassignment: true }),
    });
    const adminToggleJson = (await adminToggleOn.json()) as { data: { allowEmployeeReassignment: boolean } };
    report(
      '2.4 Admin calling PATCH /settings successfully enables allowEmployeeReassignment: true',
      adminToggleOn.status === 200 && adminToggleJson.data?.allowEmployeeReassignment === true,
      `Status: ${adminToggleOn.status}`,
    );

    const adminGetSettings = await fetch(`${API_BASE}/settings`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminGetJson = (await adminGetSettings.json()) as { data: { allowEmployeeReassignment: boolean } };
    report(
      '2.5 Admin calling GET /settings reads updated setting (200 OK)',
      adminGetSettings.status === 200 && adminGetJson.data?.allowEmployeeReassignment === true,
      `Status: ${adminGetSettings.status}`,
    );

    // =========================================================================
    // 3. PRE-EXISTING TIMELINE & STATUS HISTORY CREATION
    // =========================================================================
    console.info('\n--- 3. POPULATE PRE-EXISTING ACTIVITY & STATUS HISTORY ---');

    // Priya adds a remark
    const remarkRes = await fetch(`${API_BASE}/enquiries/${enquiry.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ remarks: 'Client expressed interest in 50 seats package.' }),
    });
    report(
      '3.1 Priya updates enquiry remarks generating REMARK_ADDED activity',
      remarkRes.status === 200,
      `Status: ${remarkRes.status}`,
    );

    // Priya changes status from NEW to CONTACTED
    const statusRes = await fetch(`${API_BASE}/enquiries/${enquiry.id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newStatus: 'CONTACTED', reason: 'Phone call discussion completed' }),
    });
    report(
      '3.2 Priya changes status to CONTACTED generating StatusHistory & STATUS_CHANGED activity',
      statusRes.status === 200,
      `Status: ${statusRes.status}`,
    );

    // =========================================================================
    // 4. FLAG ON: EMPLOYEE A FORWARDS OWN ENQUIRY TO EMPLOYEE B
    // =========================================================================
    console.info('\n--- 4. PEER FORWARDING WITH FLAG ON ---');

    const forwardRes = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: amitUser.id }),
    });

    report(
      '4.1 Employee A (Priya) forwards own enquiry to Employee B (Amit) successfully (HTTP 200 OK)',
      forwardRes.status === 200,
      `Status: ${forwardRes.status}`,
    );

    // Verify database assignedToId
    const updatedEnquiry = await prisma.enquiry.findUnique({
      where: { id: enquiry.id },
    });
    report(
      '4.2 Database enquiry record updated with assignedToId = Employee B',
      updatedEnquiry?.assignedToId === amitUser.id,
      `assignedToId: ${updatedEnquiry?.assignedToId}, Expected: ${amitUser.id}`,
    );

    // Verify Activity description text distinguishes Employee Forward
    const forwardActivity = await prisma.activity.findFirst({
      where: {
        enquiryId: enquiry.id,
        type: ActivityType.ENQUIRY_ASSIGNED,
      },
      orderBy: { createdAt: 'desc' },
    });

    report(
      '4.3 Activity description text explicitly distinguishes employee forward ("Forwarded from Priya Sharma to Amit Patel")',
      Boolean(forwardActivity?.description?.startsWith('Forwarded from Priya Sharma to Amit Patel')),
      `Activity description: "${forwardActivity?.description}"`,
    );

    // Verify AuditLog metadata
    const forwardAudit = await prisma.auditLog.findFirst({
      where: {
        entityId: enquiry.id,
        action: 'ASSIGN',
      },
      orderBy: { createdAt: 'desc' },
    });
    const auditMeta = forwardAudit?.metadata as { forwardType?: string } | null;
    report(
      '4.4 AuditLog metadata tagged with forwardType: "EMPLOYEE_FORWARD"',
      auditMeta?.forwardType === 'EMPLOYEE_FORWARD',
      `AuditLog metadata: ${JSON.stringify(auditMeta)}`,
    );

    // =========================================================================
    // 5. EMPLOYEE B IMMEDIATELY SEES FULL ACTIVITY TIMELINE & STATUS HISTORY
    // =========================================================================
    console.info('\n--- 5. RECIPIENT VISIBILITY & TIMELINE VERIFICATION ---');

    const recipientView = await fetch(`${API_BASE}/enquiries/${enquiry.id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${amitToken}` },
    });

    const recipientJson = (await recipientView.json()) as {
      status: string;
      data: {
        enquiry?: {
          id: string;
          assignedToId: string;
          activities: { type: string; description: string }[];
          statusHistory: { oldStatus: string | null; newStatus: string; reason: string | null }[];
        };
        id?: string;
        assignedToId?: string;
        activities?: { type: string; description: string }[];
        statusHistory?: { oldStatus: string | null; newStatus: string; reason: string | null }[];
      };
    };

    report(
      '5.1 Employee B (Amit) calls GET /enquiries/:id and receives 200 OK',
      recipientView.status === 200 && recipientJson.status === 'success',
      `Status: ${recipientView.status}`,
    );

    const enquiryData = recipientJson.data?.enquiry || recipientJson.data;
    const activities = enquiryData?.activities || [];
    const hasInitialAssign = activities.some((a) => a.description?.includes('Initial assignment'));
    const hasRemark = activities.some((a) => a.type === 'REMARK_ADDED');
    const hasStatusChange = activities.some((a) => a.type === 'STATUS_CHANGED');
    const hasForward = activities.some((a) => a.description?.startsWith('Forwarded from'));

    report(
      '5.2 Employee B immediately sees full pre-existing Activity timeline (initial, remark, status change, forward)',
      hasInitialAssign && hasRemark && hasStatusChange && hasForward,
      `Activities count: ${activities.length}, Types: ${activities.map((a) => a.type).join(', ')}`,
    );

    const history = enquiryData?.statusHistory || [];
    const hasStatusHistory = history.some(
      (h) => h.oldStatus === 'NEW' && h.newStatus === 'CONTACTED',
    );
    report(
      '5.3 Employee B immediately sees full pre-existing StatusHistory (NEW -> CONTACTED)',
      hasStatusHistory,
      `StatusHistory count: ${history.length}, Transitions: ${history.map((h) => `${h.oldStatus}->${h.newStatus}`).join(', ')}`,
    );

    // =========================================================================
    // 6. NON-OWNER FORWARD ATTEMPT REJECTED (403 FORBIDDEN)
    // =========================================================================
    console.info('\n--- 6. NON-OWNER FORWARD REJECTION ---');

    // Priya attempts to forward enquiry again, but she is no longer the assignee
    const nonOwnerForward = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: priyaUser.id }),
    });

    report(
      '6.1 Employee A attempting to forward an enquiry NOT owned by them is rejected (HTTP 403 Forbidden)',
      nonOwnerForward.status === 403,
      `Status: ${nonOwnerForward.status}`,
    );

    // =========================================================================
    // 7. UP-THE-CHAIN REJECTION: CANNOT FORWARD TO MANAGER OR ADMIN
    // =========================================================================
    console.info('\n--- 7. UP-THE-CHAIN REJECTION ---');

    // Amit attempts to forward to Rajesh Verma (Manager)
    const forwardToManager = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${amitToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: rajeshUser.id }),
    });

    report(
      '7.1 Employee attempting to forward enquiry to a Manager is rejected with 403 Forbidden',
      forwardToManager.status === 403,
      `Status: ${forwardToManager.status}`,
    );

    // Amit attempts to forward to Admin
    const forwardToAdmin = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${amitToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: adminUser.id }),
    });

    report(
      '7.2 Employee attempting to forward enquiry to an Admin is rejected with 403 Forbidden',
      forwardToAdmin.status === 403,
      `Status: ${forwardToAdmin.status}`,
    );

    // Amit attempts to forward to himself
    const forwardToSelf = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${amitToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: amitUser.id }),
    });

    report(
      '7.3 Employee attempting to forward enquiry to themselves is rejected with 400 Bad Request',
      forwardToSelf.status === 400,
      `Status: ${forwardToSelf.status}`,
    );

    // =========================================================================
    // 8. MANAGER REASSIGNMENT REMAINS ALLOWED & USES "Reassigned" TEXT
    // =========================================================================
    console.info('\n--- 8. MANAGER REASSIGNMENT BEHAVIOR ---');

    const managerReassign = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: priyaUser.id }),
    });

    report(
      '8.1 Manager can reassign enquiry within subordinate tree (200 OK)',
      managerReassign.status === 200,
      `Status: ${managerReassign.status}`,
    );

    const managerActivity = await prisma.activity.findFirst({
      where: {
        enquiryId: enquiry.id,
        type: ActivityType.ENQUIRY_ASSIGNED,
      },
      orderBy: { createdAt: 'desc' },
    });

    report(
      '8.2 Manager reassignment logs "Reassigned from Amit Patel to Priya Sharma" in Activity',
      Boolean(managerActivity?.description?.startsWith('Reassigned from Amit Patel to Priya Sharma')),
      `Activity description: "${managerActivity?.description}"`,
    );

    // =========================================================================
    // 9. TOGGLE FLAG OFF RESTORES STRICT LOCKDOWN
    // =========================================================================
    console.info('\n--- 9. FLAG TOGGLED OFF LOCKDOWN ---');

    await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ allowEmployeeReassignment: false }),
    });

    const finalAttempt = await fetch(`${API_BASE}/enquiries/${enquiry.id}/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${priyaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToId: amitUser.id }),
    });

    report(
      '9.1 After flag is toggled back OFF, Employee attempting forward once again gets 403 Forbidden',
      finalAttempt.status === 403,
      `Status: ${finalAttempt.status}`,
    );

    // =========================================================================
    // FINAL RESULTS SUMMARY
    // =========================================================================
    console.info('\n===========================================================');
    console.info(`TEST RESULTS: ${passedCount} Passed, ${failedCount} Failed out of ${passedCount + failedCount}`);
    console.info('===========================================================');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\nFatal test runner error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void runTests();
