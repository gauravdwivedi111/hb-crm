import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../src/prisma/client.js';
import { Role, EnquiryStatus } from '@prisma/client';
import argon2 from 'argon2';

// Load backend .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'http://localhost:5001';

interface TestResult {
  title: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function report(title: string, passed: boolean, details?: string): void {
  results.push({ title, passed, details });
  const icon = passed ? '\x1b[32m✔ [PASS]\x1b[0m' : '\x1b[31m✖ [FAIL]\x1b[0m';
  console.info(`  ${icon} ${title}`);
  if (details) {
    console.info(`         Details: ${details}`);
  }
}

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed for ${email} (HTTP ${res.status}): ${txt}`);
  }

  const json = (await res.json()) as { data: { accessToken: string } };
  return json.data.accessToken;
}

async function runSecurityAudit(): Promise<void> {
  console.info('===========================================================');
  console.info('   CRM BACKEND SECURITY PENETRATION & HARDENING AUDIT       ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  // 1. Setup test actor in database
  const passwordHash = await argon2.hash('AuditPassword123!');
  const testUser = await prisma.user.upsert({
    where: { email: 'sec_audit_user@crm.internal' },
    update: { passwordHash, isActive: true },
    create: {
      email: 'sec_audit_user@crm.internal',
      name: 'Security Audit Tester',
      passwordHash,
      role: Role.EMPLOYEE,
      isActive: true,
    },
  });

  const validToken = await loginUser('sec_audit_user@crm.internal', 'AuditPassword123!');

  // =========================================================================
  // TEST 1: HTTP Security Headers & Fingerprinting Prevention
  // =========================================================================
  console.info('👉 TEST 1: HTTP Security Headers & Stack Fingerprinting');
  try {
    const res = await fetch(`${API_BASE}/health`);
    const headers = res.headers;

    const xPoweredBy = headers.get('x-powered-by');
    const csp = headers.get('content-security-policy');
    const noSniff = headers.get('x-content-type-options');
    const frameOptions = headers.get('x-frame-options');

    const passNoPoweredBy = xPoweredBy === null;
    const passCSP = Boolean(csp && csp.includes("default-src 'none'"));
    const passNoSniff = noSniff === 'nosniff';
    const passFrame = frameOptions === 'DENY';

    report(
      '1.1 X-Powered-By is explicitly removed (no framework fingerprinting)',
      passNoPoweredBy,
      `X-Powered-By header: ${xPoweredBy ?? 'null (correctly omitted)'}`,
    );

    report(
      '1.2 Content-Security-Policy is strictly configured for JSON API (default-src none)',
      passCSP,
      `CSP Header: ${csp ?? 'none'}`,
    );

    report(
      '1.3 X-Content-Type-Options: nosniff and X-Frame-Options: DENY are enforced',
      passNoSniff && passFrame,
      `X-Content-Type-Options: ${noSniff}, X-Frame-Options: ${frameOptions}`,
    );
  } catch (err) {
    report('1. HTTP Security Headers Check', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 2: SQL Injection Neutralization via Parameterization
  // =========================================================================
  console.info('\n👉 TEST 2: SQL Injection Attack Neutralization');
  try {
    // Attack payload 1: Classic boolean tautology
    const sqli1 = "' OR '1'='1";
    const res1 = await fetch(`${API_BASE}/search?q=${encodeURIComponent(sqli1)}`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const json1 = (await res1.json()) as { status: string; data: unknown[]; count: number };

    // Attack payload 2: Table destruction injection
    const sqli2 = "'; DROP TABLE \"Customer\"; --";
    const res2 = await fetch(`${API_BASE}/search?q=${encodeURIComponent(sqli2)}`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const json2 = (await res2.json()) as { status: string; data: unknown[]; count: number };

    // Verify DB table was not dropped
    const customerCount = await prisma.customer.count();

    const passSqli1 = res1.status === 200 && json1.status === 'success';
    const passSqli2 = res2.status === 200 && json2.status === 'success';
    const passDbIntact = typeof customerCount === 'number' && customerCount >= 0;

    report(
      '2.1 SQL Injection payloads safely parameterized with zero syntax errors or unhandled exceptions',
      passSqli1 && passSqli2,
      `Payload 1 Status: ${res1.status}, Payload 2 Status: ${res2.status}`,
    );

    report(
      '2.2 Database tables remain fully intact (no malicious command execution)',
      passDbIntact,
      `Customer table record count: ${customerCount}`,
    );
  } catch (err) {
    report('2. SQL Injection Neutralization', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 3: JWT Tampering & Signature Invalidation
  // =========================================================================
  console.info('\n👉 TEST 3: JWT Integrity & Signature Tampering');
  try {
    // Tamper with the token by flipping characters in the signature segment
    const parts = validToken.split('.');
    const signature = parts[2];
    const tamperedSig =
      signature[0] === 'a' ? 'b' + signature.slice(1) : 'a' + signature.slice(1);
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const res = await fetch(`${API_BASE}/dashboard/me`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });

    const is401 = res.status === 401;
    const body = (await res.json()) as { status: string; message: string };

    report(
      '3. Tampered JWT signature is rejected with HTTP 401 Unauthorized',
      is401 && body.message.toLowerCase().includes('token'),
      `Status: ${res.status}, Message: ${body.message}`,
    );
  } catch (err) {
    report('3. JWT Tampering Verification', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 4: Missing Authorization Headers
  // =========================================================================
  console.info('\n👉 TEST 4: Missing Authentication Enforcement');
  try {
    const resGet = await fetch(`${API_BASE}/dashboard/me`);
    const resPost = await fetch(`${API_BASE}/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+919999999999' }),
    });

    const get401 = resGet.status === 401;
    const post401 = resPost.status === 401;

    report(
      '4. Protected GET and POST endpoints reject unauthenticated requests with HTTP 401',
      get401 && post401,
      `GET /dashboard/me: ${resGet.status}, POST /enquiries: ${resPost.status}`,
    );
  } catch (err) {
    report('4. Missing Authentication Check', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 5: Stored Cross-Site Scripting (XSS) Payload Safety
  // =========================================================================
  console.info('\n👉 TEST 5: Stored Cross-Site Scripting (XSS) Handling');
  try {
    const xssPayload = '<script>alert("PWNED")</script><img src=x onerror=alert(1)>';

    // Create a customer with XSS payload in notes
    const custRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        name: 'XSS Test Entity',
        phone: '+919876543299',
        notes: xssPayload,
      }),
    });

    const custJson = (await custRes.json()) as { data: { id: string; notes: string } };
    const customerId = custJson.data?.id;

    // Fetch the customer back
    const getRes = await fetch(`${API_BASE}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const getJson = (await getRes.json()) as { data: { notes: string } };

    const storedSafely = custRes.status === 201;
    const returnedVerbatim = getJson.data?.notes === xssPayload;

    report(
      '5. Stored XSS payload is safely persisted without execution; returned as verbatim JSON string for frontend escaping',
      storedSafely && returnedVerbatim,
      `Stored status: ${custRes.status}, Returned verbatim: ${returnedVerbatim}`,
    );

    // Clean up test customer
    if (customerId) {
      await prisma.customer.delete({ where: { id: customerId } });
    }
  } catch (err) {
    report('5. Stored XSS Handling', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 6: Large Body Denial-of-Service Payload (50MB Payload Rejection)
  // =========================================================================
  console.info('\n👉 TEST 6: Body Parser Size Limit Enforcement (Payload DoS)');
  try {
    // Generate a ~2MB payload (exceeds the 1MB express.json limit)
    const largeString = 'A'.repeat(2 * 1024 * 1024);
    const largeBody = JSON.stringify({
      name: 'Oversized Payload Entity',
      phone: '+919999999991',
      notes: largeString,
    });

    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: largeBody,
    });

    const is413 = res.status === 413;
    const json = (await res.json()) as { status: string; message: string };

    report(
      '6. Oversized payload (>1MB) rejected immediately with HTTP 413 Payload Too Large',
      is413 && json.status === 'error',
      `Status: ${res.status}, Message: ${json.message}`,
    );
  } catch (err) {
    report('6. Body Parser Size Limit', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 7: Information Leakage & Error Sanitization
  // =========================================================================
  console.info('\n👉 TEST 7: Production Error Sanitization & Leakage Prevention');
  try {
    // 7.1 Send malformed JSON to trigger parse error
    const parseRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: '{"invalid_json": ',
    });

    const parseJson = (await parseRes.json()) as Record<string, unknown>;
    const bodyStr = JSON.stringify(parseJson);

    // Check that no local system path (e.g. C:\Users or /home) or stack traces are leaked
    const leaksPaths = bodyStr.includes('C:\\') || bodyStr.includes('/Users/') || bodyStr.includes('/home/');
    const leaksStack = 'stack' in parseJson;

    report(
      '7.1 Malformed request responses do not leak local file paths or internal stack traces',
      !leaksPaths && !leaksStack,
      `Status: ${parseRes.status}, Contains Stack: ${leaksStack}, Contains Path: ${leaksPaths}`,
    );

    // 7.2 Anti-enumeration 404 does not leak entity existence or supervisory tree structure
    const randomId = 'non_existent_id_99999';
    const enumRes = await fetch(`${API_BASE}/customers/${randomId}`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    report(
      '7.2 Non-existent / unauthorized entity queries return clean generic 404 without internal hints',
      enumRes.status === 404,
      `Status: ${enumRes.status}`,
    );
  } catch (err) {
    report('7. Error Sanitization Check', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 8: Strict CORS Origin Enforcement
  // =========================================================================
  console.info('\n👉 TEST 8: Active CORS Origin Enforcement');
  try {
    // 8.1 Unauthorized Origin (http://evil.com) must be rejected with 403 Forbidden
    const evilRes = await fetch(`${API_BASE}/health`, {
      headers: { Origin: 'http://evil.com' },
    });

    const evilBlocked = evilRes.status === 403;
    const evilJson = (await evilRes.json()) as { status: string; message: string };

    report(
      '8.1 Unauthorized origin (http://evil.com) is actively rejected with HTTP 403 Forbidden',
      evilBlocked && evilJson.message.includes('CORS'),
      `Status: ${evilRes.status}, Message: ${evilJson.message}`,
    );

    // 8.2 Authorized Origin (http://localhost:5173) succeeds with Access-Control-Allow-Origin
    const allowedOrigin = 'http://localhost:5173';
    const okRes = await fetch(`${API_BASE}/health`, {
      headers: { Origin: allowedOrigin },
    });

    const corsHeader = okRes.headers.get('access-control-allow-origin');
    const okPassed = okRes.status === 200 && corsHeader === allowedOrigin;

    report(
      '8.2 Authorized frontend origin (http://localhost:5173) is granted access with correct CORS headers',
      okPassed,
      `Status: ${okRes.status}, Access-Control-Allow-Origin: ${corsHeader}`,
    );
  } catch (err) {
    report('8. CORS Origin Enforcement', false, (err as Error).message);
  }

  // Cleanup test user and associated tokens
  await prisma.refreshToken.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });

  console.info('\n===========================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.info(`   RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${results.length})`);
  console.info('===========================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSecurityAudit()
  .catch((err) => {
    console.error('Fatal error during security penetration audit:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
