import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
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

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

async function runTests(): Promise<void> {
  console.info('===========================================================');
  console.info('      FORGOT PASSWORD & RESET PASSWORD SECURITY SUITE      ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  try {
    // 0. Seed test personas
    console.info('🔧 Setting up test user accounts in database...');
    const initialPasswordHash = await argon2.hash('OldSecretPass123!', {
      type: argon2.argon2id,
    });

    const activeUserEmail = 'test_forgot_user@crm.internal';
    const deactivatedUserEmail = 'test_deactivated_forgot@crm.internal';
    const lockedUserEmail = 'test_lockout_forgot@crm.internal';

    const activeUser = await prisma.user.upsert({
      where: { email: activeUserEmail },
      update: {
        isActive: true,
        passwordHash: initialPasswordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        name: 'Forgot Password Active Tester',
        email: activeUserEmail,
        passwordHash: initialPasswordHash,
        role: Role.EMPLOYEE,
        isActive: true,
      },
    });

    const deactivatedUser = await prisma.user.upsert({
      where: { email: deactivatedUserEmail },
      update: {
        isActive: false,
        passwordHash: initialPasswordHash,
      },
      create: {
        name: 'Deactivated User Tester',
        email: deactivatedUserEmail,
        passwordHash: initialPasswordHash,
        role: Role.EMPLOYEE,
        isActive: false,
      },
    });

    const lockedUser = await prisma.user.upsert({
      where: { email: lockedUserEmail },
      update: {
        isActive: true,
        passwordHash: initialPasswordHash,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // Locked for 15 minutes
      },
      create: {
        name: 'Locked Out User Tester',
        email: lockedUserEmail,
        passwordHash: initialPasswordHash,
        role: Role.EMPLOYEE,
        isActive: true,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Clean any residual reset tokens for test users
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: { in: [activeUser.id, deactivatedUser.id, lockedUser.id] },
      },
    });

    console.info('Test actors and clean state established.\n');

    // =========================================================================
    // 1. VALID EMAIL FORGOT PASSWORD REQUEST
    // =========================================================================
    console.info('👉 TEST 1: Request Reset for Valid Active Email');

    const startValid = performance.now();
    const validForgotRes = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass-rate-limit': 'true',
      },
      body: JSON.stringify({ email: activeUserEmail }),
    });
    const durationValid = performance.now() - startValid;

    const validForgotJson = (await validForgotRes.json()) as {
      status: string;
      message: string;
    };

    const expectedMessage = 'If an account exists with this email, a reset link has been sent.';

    report(
      '1.1 Valid email reset request returns HTTP 200 with generic anti-enumeration message',
      validForgotRes.status === 200 && validForgotJson.message === expectedMessage,
      `Status: ${validForgotRes.status}, Message: "${validForgotJson.message}"`,
    );

    // Verify token was generated in database
    const dbTokenRecord = await prisma.passwordResetToken.findFirst({
      where: { userId: activeUser.id },
      orderBy: { createdAt: 'desc' },
    });

    const hasValidExpiry =
      Boolean(dbTokenRecord?.expiresAt) &&
      dbTokenRecord!.expiresAt.getTime() > Date.now() + 25 * 60 * 1000;

    report(
      '1.2 Active user reset token stored in database with ~30 minute expiry and null usedAt',
      Boolean(dbTokenRecord) && dbTokenRecord?.usedAt === null && hasValidExpiry,
      `Token ID: ${dbTokenRecord?.id}, ExpiresAt: ${dbTokenRecord?.expiresAt?.toISOString()}`,
    );

    // =========================================================================
    // 2. NON-EXISTENT EMAIL ANTI-ENUMERATION & TIMING NEUTRALITY
    // =========================================================================
    console.info('\n👉 TEST 2: Request Reset for Non-Existent Email (Timing & Message Check)');

    const nonExistentEmail = `unknown_account_${Date.now()}@crm.internal`;

    const startInvalid = performance.now();
    const invalidForgotRes = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass-rate-limit': 'true',
      },
      body: JSON.stringify({ email: nonExistentEmail }),
    });
    const durationInvalid = performance.now() - startInvalid;

    const invalidForgotJson = (await invalidForgotRes.json()) as {
      status: string;
      message: string;
    };

    report(
      '2.1 Non-existent email returns identical generic success message (Anti-Enumeration)',
      invalidForgotRes.status === 200 && invalidForgotJson.message === expectedMessage,
      `Status: ${invalidForgotRes.status}, Message: "${invalidForgotJson.message}"`,
    );

    // Timing neutrality check: Invalid email response must not be significantly faster than valid email
    // (Both should execute in comparable time window due to dummy crypto & delay equalization)
    const isTimingProtected = durationInvalid >= 25; // Dummy delay guarantees minimum ~50ms
    report(
      '2.2 Response duration is timing-neutral (not instantaneously faster for non-existent emails)',
      isTimingProtected,
      `Valid Email: ${durationValid.toFixed(1)}ms, Non-Existent Email: ${durationInvalid.toFixed(1)}ms`,
    );

    // Verify no token created
    const invalidDbTokens = await prisma.passwordResetToken.findMany({
      where: { user: { email: nonExistentEmail } },
    });
    report(
      '2.3 No token record created in database for non-existent email',
      invalidDbTokens.length === 0,
      `Count: ${invalidDbTokens.length}`,
    );

    // =========================================================================
    // 3. DEACTIVATED USER ANTI-ENUMERATION
    // =========================================================================
    console.info('\n👉 TEST 3: Request Reset for Deactivated User');

    const deactivatedRes = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass-rate-limit': 'true',
      },
      body: JSON.stringify({ email: deactivatedUserEmail }),
    });

    const deactivatedJson = (await deactivatedRes.json()) as {
      status: string;
      message: string;
    };

    const deactivatedDbTokens = await prisma.passwordResetToken.findMany({
      where: { userId: deactivatedUser.id },
    });

    report(
      '3.1 Deactivated user returns identical generic success message without leaking account status',
      deactivatedRes.status === 200 && deactivatedJson.message === expectedMessage,
      `Status: ${deactivatedRes.status}, Message: "${deactivatedJson.message}"`,
    );

    report(
      '3.2 No reset token created for deactivated user (cannot reactivate via password reset)',
      deactivatedDbTokens.length === 0,
      `Deactivated tokens in DB: ${deactivatedDbTokens.length}`,
    );

    // =========================================================================
    // 4. EXPIRED TOKEN REJECTION
    // =========================================================================
    console.info('\n👉 TEST 4: Expired Token Rejection');

    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredTokenHash = hashToken(expiredRawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: activeUser.id,
        tokenHash: expiredTokenHash,
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // Expired 10 minutes ago
        usedAt: null,
      },
    });

    const expiredResetRes = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: expiredRawToken,
        newPassword: 'BrandNewPassword123!',
      }),
    });

    report(
      '4.1 Using an expired token is rejected with HTTP 400 Bad Request',
      expiredResetRes.status === 400,
      `Status: ${expiredResetRes.status}`,
    );

    // =========================================================================
    // 5. SUCCESSFUL RESET, SESSION REVOCATION & PASSWORD VERIFICATION
    // =========================================================================
    console.info('\n👉 TEST 5: Successful Password Reset & Full Session Revocation');

    // Step A: Active user logs in with old password and gets a refresh token
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: activeUserEmail,
        password: 'OldSecretPass123!',
      }),
    });

    const setCookieHeader = loginRes.headers.get('set-cookie') || '';
    const refreshTokenCookie = setCookieHeader.split(';')[0] || '';

    report(
      '5.1 Active user logs in with old password and obtains valid session cookie',
      loginRes.status === 200 && Boolean(refreshTokenCookie),
      `Status: ${loginRes.status}, Cookie: ${refreshTokenCookie ? 'present' : 'missing'}`,
    );

    // Step B: Create a fresh valid reset token
    const validRawToken = crypto.randomBytes(32).toString('hex');
    const validTokenHash = hashToken(validRawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: activeUser.id,
        tokenHash: validTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
      },
    });

    // Step C: Reset the password
    const newPassword = 'SecureNewPassword456!';
    const resetRes = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: validRawToken,
        newPassword,
      }),
    });

    report(
      '5.2 Valid reset token and new password accepted with HTTP 200 OK',
      resetRes.status === 200,
      `Status: ${resetRes.status}`,
    );

    // Step D: Confirm token marked used in DB
    const usedTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: validTokenHash },
    });

    report(
      '5.3 PasswordResetToken in database marked usedAt = now()',
      Boolean(usedTokenRecord?.usedAt),
      `usedAt: ${usedTokenRecord?.usedAt?.toISOString()}`,
    );

    // Step E: Confirm old session's refresh token was revoked
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: refreshTokenCookie,
      },
    });

    report(
      '5.4 Existing refresh token from before reset is now REVOKED (HTTP 401)',
      refreshRes.status === 401,
      `Status: ${refreshRes.status}`,
    );

    // Step F: Login with new password succeeds
    const newLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: activeUserEmail,
        password: newPassword,
      }),
    });

    report(
      '5.5 User can immediately log in with the new password (HTTP 200)',
      newLoginRes.status === 200,
      `Status: ${newLoginRes.status}`,
    );

    // Step G: Login with old password now fails
    const oldLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: activeUserEmail,
        password: 'OldSecretPass123!',
      }),
    });

    report(
      '5.6 Login attempt with old password is now rejected (HTTP 401)',
      oldLoginRes.status === 401,
      `Status: ${oldLoginRes.status}`,
    );

    // =========================================================================
    // 6. TOKEN REUSE REJECTION (REPLAY ATTACK PROTECTION)
    // =========================================================================
    console.info('\n👉 TEST 6: Token Replay / Reuse Rejection');

    const replayRes = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: validRawToken,
        newPassword: 'AnotherPassword789!',
      }),
    });

    report(
      '6.1 Using a token twice is rejected the second time (Replay Protection, HTTP 400)',
      replayRes.status === 400,
      `Status: ${replayRes.status}`,
    );

    // =========================================================================
    // 7. LOCKED-OUT ACCOUNT RECOVERY
    // =========================================================================
    console.info('\n👉 TEST 7: Resetting Password Clears Account Lockout');

    // Confirm account is currently locked out
    const lockedLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: lockedUserEmail,
        password: 'OldSecretPass123!',
      }),
    });

    report(
      '7.1 Pre-condition: Locked-out account login rejected with HTTP 423 Locked',
      lockedLoginRes.status === 423,
      `Status: ${lockedLoginRes.status}`,
    );

    // Issue reset token for locked user
    const lockedRawToken = crypto.randomBytes(32).toString('hex');
    const lockedTokenHash = hashToken(lockedRawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: lockedUser.id,
        tokenHash: lockedTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
      },
    });

    const unlockPassword = 'RecoveredPassword999!';
    const unlockResetRes = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: lockedRawToken,
        newPassword: unlockPassword,
      }),
    });

    report(
      '7.2 Password reset for locked account succeeds (HTTP 200)',
      unlockResetRes.status === 200,
      `Status: ${unlockResetRes.status}`,
    );

    // Check DB state for failedLoginCount and lockedUntil
    const updatedLockedUser = await prisma.user.findUnique({
      where: { id: lockedUser.id },
    });

    report(
      '7.3 Database confirms failedLoginCount reset to 0 and lockedUntil cleared to null',
      updatedLockedUser?.failedLoginCount === 0 && updatedLockedUser?.lockedUntil === null,
      `failedLoginCount: ${updatedLockedUser?.failedLoginCount}, lockedUntil: ${updatedLockedUser?.lockedUntil}`,
    );

    // Confirm immediate successful login with unlocked account
    const unlockedLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: lockedUserEmail,
        password: unlockPassword,
      }),
    });

    report(
      '7.4 Unlocked account logs in successfully with new password (HTTP 200)',
      unlockedLoginRes.status === 200,
      `Status: ${unlockedLoginRes.status}`,
    );

    // =========================================================================
    // CLEANUP
    // =========================================================================
    console.info('\n🧹 Cleaning up test records...');
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: { in: [activeUser.id, deactivatedUser.id, lockedUser.id] },
      },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        userId: { in: [activeUser.id, deactivatedUser.id, lockedUser.id] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [activeUser.id, deactivatedUser.id, lockedUser.id] },
      },
    });

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
