import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role, EnquiryStatus, FollowupFrequency, FollowupStatus, ActivityType } from '@prisma/client';
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
  console.info('   FOLLOW-UP COMPLETION, REASSIGNMENT & DRILL-DOWN SUITE   ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  try {
    const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });

    // 0. Ensure personas exist
    const admin = await prisma.user.upsert({
      where: { email: 'admin@hbcrm.local' },
      update: { isActive: true },
      create: {
        name: 'Super Admin',
        email: 'admin@hbcrm.local',
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    const managerA = await prisma.user.upsert({
      where: { email: 'manager.drilldown.a@hbcrm.local' },
      update: { isActive: true, role: Role.MANAGER },
      create: {
        name: 'Manager Drilldown A',
        email: 'manager.drilldown.a@hbcrm.local',
        passwordHash,
        role: Role.MANAGER,
        isActive: true,
      },
    });

    const managerB = await prisma.user.upsert({
      where: { email: 'manager.drilldown.b@hbcrm.local' },
      update: { isActive: true, role: Role.MANAGER },
      create: {
        name: 'Manager Drilldown B',
        email: 'manager.drilldown.b@hbcrm.local',
        passwordHash,
        role: Role.MANAGER,
        isActive: true,
      },
    });

    const empA1 = await prisma.user.upsert({
      where: { email: 'emp.drilldown.a1@hbcrm.local' },
      update: { isActive: true, role: Role.EMPLOYEE, supervisorId: managerA.id },
      create: {
        name: 'Employee Drilldown A1',
        email: 'emp.drilldown.a1@hbcrm.local',
        passwordHash,
        role: Role.EMPLOYEE,
        supervisorId: managerA.id,
        isActive: true,
      },
    });

    const empA2 = await prisma.user.upsert({
      where: { email: 'emp.drilldown.a2@hbcrm.local' },
      update: { isActive: true, role: Role.EMPLOYEE, supervisorId: managerA.id },
      create: {
        name: 'Employee Drilldown A2',
        email: 'emp.drilldown.a2@hbcrm.local',
        passwordHash,
        role: Role.EMPLOYEE,
        supervisorId: managerA.id,
        isActive: true,
      },
    });

    const empB1 = await prisma.user.upsert({
      where: { email: 'emp.drilldown.b1@hbcrm.local' },
      update: { isActive: true, role: Role.EMPLOYEE, supervisorId: managerB.id },
      create: {
        name: 'Employee Drilldown B1',
        email: 'emp.drilldown.b1@hbcrm.local',
        passwordHash,
        role: Role.EMPLOYEE,
        supervisorId: managerB.id,
        isActive: true,
      },
    });

    // Authenticate personas
    const adminToken = await loginUser(admin.email, 'AdminPassword123!').catch(() => loginUser(admin.email, 'Password123!'));
    const managerAToken = await loginUser(managerA.email, 'Password123!');
    const managerBToken = await loginUser(managerB.email, 'Password123!');
    const empA1Token = await loginUser(empA1.email, 'Password123!');
    const empA2Token = await loginUser(empA2.email, 'Password123!');
    const empB1Token = await loginUser(empB1.email, 'Password123!');

    // Clean up or ensure SystemSettings
    await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ allowEmployeeReassignment: false }),
    });

    // Setup Test Customer and Enquiry for Part A & B
    const timestamp = Date.now();
    const phone = `97${String(timestamp).slice(-8)}`;
    const customer = await prisma.customer.create({
      data: {
        name: `Customer DD ${timestamp}`,
        phone,
        email: `cust_${timestamp}@test.local`,
        companyName: 'DD Test Enterprises',
        assignedToId: empA1.id,
      },
    });

    const enquiry = await prisma.enquiry.create({
      data: {
        customerId: customer.id,
        phone,
        companyName: 'DD Test Enterprises',
        product: 'Industrial Solar Plant',
        source: 'WEBSITE',
        status: EnquiryStatus.NEW,
        assignedToId: empA1.id,
        createdById: empA1.id,
      },
    });

    console.info('\n--- PART A: FOLLOW-UP MARK COMPLETE & AUTO-RECURRENCE ---');

    // 1. Complete recurring weekly follow-up
    const scheduledDate = new Date(Date.now() + 86400000);
    const recurringFollowup = await prisma.followup.create({
      data: {
        enquiryId: enquiry.id,
        customerId: customer.id,
        assignedToId: empA1.id,
        dueAt: scheduledDate,
        frequency: FollowupFrequency.WEEKLY,
        status: FollowupStatus.PENDING,
        purpose: 'Initial recurring weekly discussion',
      },
    });

    const completeRes = await fetch(`${API_BASE}/followups/${recurringFollowup.id}/complete`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empA1Token}`,
      },
      body: JSON.stringify({ notes: 'Completed discussion with client, auto-schedule next week' }),
    });

    const completeJson = (await completeRes.json()) as { status: string; data: { followup: { status: string; completedAt: string }; nextFollowup?: { id: string; dueAt: string } } };
    report(
      'PATCH /followups/:id/complete marks status as COMPLETED',
      completeRes.status === 200 && completeJson.data?.followup?.status === 'COMPLETED',
      `HTTP ${completeRes.status}, status: ${completeJson.data?.followup?.status}`,
    );

    // Verify next recurring occurrence created
    const autoNextFollowup = await prisma.followup.findFirst({
      where: {
        enquiryId: enquiry.id,
        frequency: FollowupFrequency.WEEKLY,
        status: FollowupStatus.PENDING,
        id: { not: recurringFollowup.id },
      },
    });

    report(
      'Next occurrence automatically scheduled in DB for recurring follow-up',
      Boolean(autoNextFollowup && autoNextFollowup.frequency === FollowupFrequency.WEEKLY && autoNextFollowup.status === FollowupStatus.PENDING),
      `Found next followup ID: ${autoNextFollowup?.id}, dueAt: ${autoNextFollowup?.dueAt.toISOString()}`,
    );

    // Verify Activity logged
    const completionActivity = await prisma.activity.findFirst({
      where: {
        enquiryId: enquiry.id,
        type: ActivityType.FOLLOW_UP_COMPLETED,
      },
      orderBy: { createdAt: 'desc' },
    });

    report(
      'Activity timeline records FOLLOW_UP_COMPLETED',
      Boolean(completionActivity && completionActivity.description?.includes('Follow-up completed')),
      `Activity ID: ${completionActivity?.id}, description: ${completionActivity?.description}`,
    );

    // 2. Complete one-time follow-up: should NOT create next occurrence
    const oneTimeFollowup = await prisma.followup.create({
      data: {
        enquiryId: enquiry.id,
        customerId: customer.id,
        assignedToId: empA1.id,
        dueAt: new Date(Date.now() + 172800000),
        frequency: FollowupFrequency.ONE_TIME,
        status: FollowupStatus.PENDING,
        purpose: 'One-off follow up',
      },
    });

    const completeOneTimeRes = await fetch(`${API_BASE}/followups/${oneTimeFollowup.id}/complete`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empA1Token}`,
      },
      body: JSON.stringify({}),
    });

    const completeOneTimeJson = (await completeOneTimeRes.json()) as { status: string; data: { followup: { status: string }; nextFollowup?: unknown } };
    const oneTimePendingCount = await prisma.followup.count({
      where: {
        enquiryId: enquiry.id,
        frequency: FollowupFrequency.ONE_TIME,
        status: FollowupStatus.PENDING,
      },
    });

    report(
      'One-time follow-up completion does not create subsequent recurrence',
      completeOneTimeRes.status === 200 && completeOneTimeJson.data?.nextFollowup === null && oneTimePendingCount === 0,
      `HTTP ${completeOneTimeRes.status}, nextFollowup: ${completeOneTimeJson.data?.nextFollowup}, pending: ${oneTimePendingCount}`,
    );

    console.info('\n--- PART B: FOLLOW-UP REASSIGNMENT & ACCESS CONTROL ---');

    // Create a new follow-up assigned to empA1
    const followupToReassign = await prisma.followup.create({
      data: {
        enquiryId: enquiry.id,
        customerId: customer.id,
        assignedToId: empA1.id,
        dueAt: new Date(Date.now() + 259200000),
        frequency: FollowupFrequency.ONE_TIME,
        status: FollowupStatus.PENDING,
        purpose: 'Task to be reassigned',
      },
    });

    // Test 1: Self-reassignment rejected (400)
    const selfReassignRes = await fetch(`${API_BASE}/followups/${followupToReassign.id}/reassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empA1Token}`,
      },
      body: JSON.stringify({ assignedToId: empA1.id }),
    });
    report(
      'Employee cannot reassign follow-up to self (400)',
      selfReassignRes.status === 400,
      `HTTP ${selfReassignRes.status}`,
    );

    // Test 2: Employee reassignment blocked when allowEmployeeReassignment is false (403)
    const blockedFwdRes = await fetch(`${API_BASE}/followups/${followupToReassign.id}/reassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empA1Token}`,
      },
      body: JSON.stringify({ assignedToId: empA2.id }),
    });
    report(
      'Employee reassignment rejected when forwarding is disabled (403)',
      blockedFwdRes.status === 403,
      `HTTP ${blockedFwdRes.status}`,
    );

    // Test 3: Enable employee forwarding via Admin settings
    const enableSettingsRes = await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ allowEmployeeReassignment: true }),
    });
    report(
      'Admin enables allowEmployeeReassignment toggle (200)',
      enableSettingsRes.status === 200,
      `HTTP ${enableSettingsRes.status}`,
    );

    // Test 4: Employee successfully reassigns follow-up to peer employee empA2
    const empReassignRes = await fetch(`${API_BASE}/followups/${followupToReassign.id}/reassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empA1Token}`,
      },
      body: JSON.stringify({ assignedToId: empA2.id }),
    });
    const empReassignJson = (await empReassignRes.json()) as { status: string; data: { followup: { id: string; assignedToId: string } } };

    report(
      'Employee successfully reassigns follow-up to peer when forwarding is enabled (200)',
      empReassignRes.status === 200 && empReassignJson.data?.followup?.assignedToId === empA2.id,
      `HTTP ${empReassignRes.status}, assignedToId: ${empReassignJson.data?.followup?.assignedToId}`,
    );

    // Test 5: Verify parent enquiry assignee remains UNCHANGED
    const parentEnquiryAfterReassign = await prisma.enquiry.findUnique({
      where: { id: enquiry.id },
    });
    report(
      'Parent enquiry assignedToId remains UNCHANGED after follow-up reassignment',
      parentEnquiryAfterReassign?.assignedToId === empA1.id,
      `Enquiry assignedToId: ${parentEnquiryAfterReassign?.assignedToId}, expected: ${empA1.id}`,
    );

    // Test 6: Verify Activity and AuditLog rows created
    const reassignActivity = await prisma.activity.findFirst({
      where: {
        enquiryId: enquiry.id,
        type: ActivityType.FOLLOW_UP_SCHEDULED,
      },
      orderBy: { createdAt: 'desc' },
    });
    const reassignAuditLog = await prisma.auditLog.findFirst({
      where: {
        entityId: followupToReassign.id,
        entityType: 'Followup',
        action: 'ASSIGN',
      },
      orderBy: { createdAt: 'desc' },
    });

    report(
      'Reassignment logs Activity and AuditLog records with correct metadata',
      Boolean(
        reassignActivity &&
        reassignActivity.description?.includes('Follow-up reassigned from') &&
        reassignAuditLog &&
        reassignAuditLog.userId === empA1.id,
      ),
      `Activity desc: "${reassignActivity?.description}", AuditLog action: "${reassignAuditLog?.action}"`,
    );

    // Test 7: Employee cannot reassign a follow-up they do not own (empA1 trying to reassign followup now owned by empA2)
    const notOwnerRes = await fetch(`${API_BASE}/followups/${followupToReassign.id}/reassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empA1Token}`,
      },
      body: JSON.stringify({ assignedToId: empA1.id }),
    });
    report(
      'Employee cannot reassign a follow-up they do not own (403)',
      notOwnerRes.status === 403,
      `HTTP ${notOwnerRes.status}`,
    );

    // Test 8: Manager A can reassign follow-up of their subordinate empA2 to empA1
    const mgrReassignRes = await fetch(`${API_BASE}/followups/${followupToReassign.id}/reassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ assignedToId: empA1.id }),
    });
    report(
      'Manager can reassign follow-up within their subordinate tree (200)',
      mgrReassignRes.status === 200,
      `HTTP ${mgrReassignRes.status}`,
    );

    // Test 9: Manager B cannot reassign follow-up outside their tree (followup belonging to empA1 in Manager A tree)
    const mgrOutTreeRes = await fetch(`${API_BASE}/followups/${followupToReassign.id}/reassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerBToken}`,
      },
      body: JSON.stringify({ assignedToId: empB1.id }),
    });
    report(
      'Manager cannot reassign follow-up outside their subordinate tree (403)',
      mgrOutTreeRes.status === 403,
      `HTTP ${mgrOutTreeRes.status}`,
    );

    console.info('\n--- PART C: ADMIN HIERARCHY DRILL-DOWN & PROFILE TEAM BREAKDOWN ---');

    // Test 10: Admin viewing Manager A profile receives team metrics breakdown
    const mgrProfileRes = await fetch(`${API_BASE}/users/${managerA.id}/profile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const mgrProfileJson = (await mgrProfileRes.json()) as {
      status: string;
      data: {
        id: string;
        role: string;
        team?: Array<{ user: { id: string; name: string } }>;
      };
    };

    const teamMemberIds = (mgrProfileJson.data?.team || []).map((m) => m.user.id);
    report(
      'Admin viewing Manager profile receives subordinate team breakdown',
      mgrProfileRes.status === 200 &&
      Array.isArray(mgrProfileJson.data?.team) &&
      teamMemberIds.includes(empA1.id) &&
      teamMemberIds.includes(empA2.id),
      `HTTP ${mgrProfileRes.status}, team members found: ${teamMemberIds.join(', ')}`,
    );

    // Test 11: Admin viewing Employee profile does not have team metrics
    const empProfileRes = await fetch(`${API_BASE}/users/${empA1.id}/profile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const empProfileJson = (await empProfileRes.json()) as {
      status: string;
      data: {
        id: string;
        role: string;
        team?: unknown[];
      };
    };
    report(
      'Admin viewing Employee profile has no team metrics (undefined)',
      empProfileRes.status === 200 && empProfileJson.data?.team === undefined,
      `HTTP ${empProfileRes.status}, team: ${typeof empProfileJson.data?.team}`,
    );

    // Test 12: Admin calling GET /dashboard/team?managerId=:id receives scoped manager team dashboard
    const scopedTeamRes = await fetch(`${API_BASE}/dashboard/team?managerId=${managerA.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const scopedTeamJson = (await scopedTeamRes.json()) as {
      status: string;
      data: Array<{
        user: { id: string };
      }>;
    };
    const scopedMemberIds = (scopedTeamJson.data || []).map((m) => m.user.id);
    report(
      'Admin GET /dashboard/team?managerId=:id returns subordinates scoped to that manager',
      scopedTeamRes.status === 200 &&
      scopedMemberIds.includes(empA1.id) &&
      scopedMemberIds.includes(empA2.id) &&
      !scopedMemberIds.includes(empB1.id),
      `HTTP ${scopedTeamRes.status}, scoped members: ${scopedMemberIds.join(', ')}`,
    );

  } catch (err) {
    console.error('Test run encountered fatal error:', err);
    failedCount++;
  } finally {
    try {
      await prisma.systemSettings.upsert({
        where: { id: 'default' },
        update: { allowEmployeeReassignment: false },
        create: { id: 'default', allowEmployeeReassignment: false },
      });
    } catch {
      // Ignore
    }
    await prisma.$disconnect();
  }

  console.info('\n===========================================================');
  console.info(`   RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.info('===========================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

void runTests();
