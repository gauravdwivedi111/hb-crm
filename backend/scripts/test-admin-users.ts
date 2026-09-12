import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role } from '@prisma/client';
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

async function loginUser(email: string, password: string): Promise<{ token: string; cookie: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} (HTTP ${res.status}): ${text}`);
  }

  const rawCookie = res.headers.get('set-cookie') || '';
  const json = (await res.json()) as { data: { accessToken: string } };
  return { token: json.data.accessToken, cookie: rawCookie };
}

async function run() {
  console.log('\n===========================================================');
  console.log('       ADMIN USER MANAGEMENT TEST SUITE');
  console.log('===========================================================');
  console.log(`Target Backend: ${API_BASE}\n`);

  const passwordHash = await argon2.hash('TestPassword123!', { type: argon2.argon2id });

  // 1. Ensure test admin and test non-admin exist
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

  const employeeEmail = 'test-emp-rbac@hbcrm.local';
  await prisma.user.deleteMany({ where: { email: employeeEmail } });
  const employee = await prisma.user.create({
    data: {
      name: 'Test Regular Employee',
      email: employeeEmail,
      passwordHash,
      role: Role.EMPLOYEE,
    },
  });

  const { token: adminToken } = await loginUser(adminEmail, 'AdminPassword123!');
  const { token: employeeToken } = await loginUser(employeeEmail, 'TestPassword123!');

  // Test 1: Non-admin rejected from GET /users
  const empListRes = await fetch(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  report('1. Employee calling GET /users is rejected with 403 Forbidden', empListRes.status === 403);

  // Test 2: Admin can list users
  const adminListRes = await fetch(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  report('2.1 Admin calling GET /users receives 200 OK', adminListRes.status === 200);
  const adminListData = (await adminListRes.json()) as { data: Array<Record<string, unknown>> };
  report('2.2 Response contains users list array', Array.isArray(adminListData.data) && adminListData.data.length > 0);
  const containsHashes = adminListData.data.some((u) => 'passwordHash' in u || 'password' in u);
  report('2.3 Sensitive auth data (passwordHash) is NOT present in user list', !containsHashes);

  // Test 3: Admin registers a new user with supervisor
  const targetEmail = `target-user-${Date.now()}@hbcrm.local`;
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Target Test User',
      email: targetEmail,
      password: 'TargetPassword123!',
      role: 'EMPLOYEE',
      supervisorId: admin.id,
    }),
  });
  report('3.1 Admin calls POST /auth/register to create employee with supervisor', registerRes.status === 201);
  const registerData = (await registerRes.json()) as { data: { user: { id: string; email: string } } };
  const targetUserId = registerData.data.user.id;

  // Test 4: Target user logs in
  const targetLogin = await loginUser(targetEmail, 'TargetPassword123!');
  report('4. Newly created user can log in and receives refresh token cookie', !!targetLogin.token && !!targetLogin.cookie);

  // Test 5: Admin cannot deactivate themselves
  const selfDeactivateRes = await fetch(`${API_BASE}/users/${admin.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: false }),
  });
  report('5. Admin attempting self-deactivation is rejected with 400 Bad Request', selfDeactivateRes.status === 400);

  // Test 6: Admin deactivates target user
  const deactivateRes = await fetch(`${API_BASE}/users/${targetUserId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: false }),
  });
  report('6. Admin deactivates target user (HTTP 200 OK)', deactivateRes.status === 200);

  // Test 6B: Zero-delay access token revocation (existing unexpired access token rejected immediately)
  const immediateProtectedRes = await fetch(`${API_BASE}/enquiries`, {
    headers: { Authorization: `Bearer ${targetLogin.token}` },
  });
  report('6B. Deactivated user existing access token is rejected IMMEDIATELY with 403 (zero delay)', immediateProtectedRes.status === 403);

  // Test 7: Target user refresh token is rejected
  const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      Cookie: targetLogin.cookie,
    },
  });
  report('7. Deactivated user refresh token is immediately rejected (HTTP 401 or 403)', refreshRes.status === 401 || refreshRes.status === 403);

  // Test 8: Target user login is rejected
  const blockedLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: targetEmail, password: 'TargetPassword123!' }),
  });
  report('8. Deactivated user login is rejected with 403 Forbidden', blockedLoginRes.status === 403);

  // Test 9: Admin reactivates target user
  const reactivateRes = await fetch(`${API_BASE}/users/${targetUserId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: true }),
  });
  report('9. Admin reactivates target user (HTTP 200 OK)', reactivateRes.status === 200);

  // Test 10: Reactivated user can log in again
  const reactivatedLogin = await loginUser(targetEmail, 'TargetPassword123!');
  report('10. Reactivated user logs in successfully', !!reactivatedLogin.token);

  // Clean up
  await prisma.refreshToken.deleteMany({ where: { userId: targetUserId } });
  await prisma.user.delete({ where: { id: targetUserId } });
  await prisma.refreshToken.deleteMany({ where: { userId: employee.id } });
  await prisma.user.delete({ where: { id: employee.id } });

  console.log('\n===========================================================');
  console.log(`   RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===========================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
