import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import { Role, QuotationStatus, ActivityType } from '@prisma/client';
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
  console.info('  CUSTOMER, QUOTATION & SECURE ATTACHMENT MODULE TEST SUITE');
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

  console.info('🔧 Setting up test actors and seed data...');
  const testPasswordHash = await argon2.hash('TestPass12345!', { type: argon2.argon2id });

  // 1. Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'test_admin_mod@crm.internal' },
    update: { isActive: true },
    create: {
      name: 'Admin Module Tester',
      email: 'test_admin_mod@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.ADMIN,
    },
  });

  // 2. Manager
  const managerUser = await prisma.user.upsert({
    where: { email: 'test_mgr_mod@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id },
    create: {
      name: 'Manager Module Tester',
      email: 'test_mgr_mod@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.MANAGER,
      supervisorId: adminUser.id,
    },
  });

  // 3. Employee A (supervised by Manager)
  const employeeUserA = await prisma.user.upsert({
    where: { email: 'test_emp_a_mod@crm.internal' },
    update: { isActive: true, supervisorId: managerUser.id },
    create: {
      name: 'Employee A Module Tester',
      email: 'test_emp_a_mod@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
      supervisorId: managerUser.id,
    },
  });

  // 4. Employee B (unrelated employee)
  const employeeUserB = await prisma.user.upsert({
    where: { email: 'test_emp_b_mod@crm.internal' },
    update: { isActive: true, supervisorId: null },
    create: {
      name: 'Employee B Module Tester',
      email: 'test_emp_b_mod@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
    },
  });

  // 5. Manager 2 (Separate, non-overlapping supervisory tree)
  const managerUser2 = await prisma.user.upsert({
    where: { email: 'test_mgr2_mod@crm.internal' },
    update: { isActive: true, supervisorId: adminUser.id },
    create: {
      name: 'Manager 2 Module Tester',
      email: 'test_mgr2_mod@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.MANAGER,
      supervisorId: adminUser.id,
    },
  });

  // 6. Employee C (supervised by Manager 2)
  const employeeUserC = await prisma.user.upsert({
    where: { email: 'test_emp_c_mod@crm.internal' },
    update: { isActive: true, supervisorId: managerUser2.id },
    create: {
      name: 'Employee C Module Tester',
      email: 'test_emp_c_mod@crm.internal',
      passwordHash: testPasswordHash,
      role: Role.EMPLOYEE,
      supervisorId: managerUser2.id,
    },
  });

  // Obtain tokens
  const adminToken = await loginUser('test_admin_mod@crm.internal', 'TestPass12345!');
  const managerToken = await loginUser('test_mgr_mod@crm.internal', 'TestPass12345!');
  const manager2Token = await loginUser('test_mgr2_mod@crm.internal', 'TestPass12345!');
  const empAToken = await loginUser('test_emp_a_mod@crm.internal', 'TestPass12345!');
  const empBToken = await loginUser('test_emp_b_mod@crm.internal', 'TestPass12345!');

  // Seed Customer and Enquiry for Employee A
  const testCustomerA = await prisma.customer.create({
    data: {
      name: 'Customer Owned by Emp A',
      phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      email: `cust_a_${Date.now()}@example.com`,
      assignedToId: employeeUserA.id,
    },
  });

  const testEnquiryA = await prisma.enquiry.create({
    data: {
      customerId: testCustomerA.id,
      phone: testCustomerA.phone,
      product: 'Commercial Solar System',
      assignedToId: employeeUserA.id,
      createdById: employeeUserA.id,
    },
  });

  console.info('Test actors and baseline data ready.\n');

  // =========================================================================
  // TEST 1: Customer Module Endpoints (CRUD, Scoping, Anti-Enumeration)
  // =========================================================================
  console.info('👉 TEST 1: Customer Module CRUD & Scoping');
  try {
    // 1.1 Create customer via POST /customers
    const createCustRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({
        name: 'Acme Solar Client',
        companyName: 'Acme Corp',
        phone: '+919999988888',
        email: 'info@acmecorp.example',
        location: 'Mumbai, MH',
      }),
    });
    const createCustJson = (await createCustRes.json()) as { status: string; data: { id: string; assignedToId: string } };
    const newCustId = createCustJson.data?.id;

    report(
      '1.1 Employee can create customer and assignedToId defaults to caller',
      createCustRes.status === 201 && createCustJson.data?.assignedToId === employeeUserA.id,
      `Status: ${createCustRes.status}, assignedToId: ${createCustJson.data?.assignedToId}`,
    );

    // 1.2 Anti-enumeration: Employee B reading Customer A receives 404
    const empBReadRes = await fetch(`${API_BASE}/customers/${testCustomerA.id}`, {
      headers: { Authorization: `Bearer ${empBToken}` },
    });
    report(
      '1.2 Anti-enumeration: Employee B reading Customer A returns 404 Not Found',
      empBReadRes.status === 404,
      `Status: ${empBReadRes.status}`,
    );

    // 1.3 Manager can read Customer A (subordinate tree)
    const mgrReadRes = await fetch(`${API_BASE}/customers/${testCustomerA.id}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    report(
      '1.3 Manager can read Customer A via subordinate tree hierarchy',
      mgrReadRes.status === 200,
      `Status: ${mgrReadRes.status}`,
    );

    // 1.4 Update customer contact fields
    const patchCustRes = await fetch(`${API_BASE}/customers/${newCustId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({
        location: 'Pune, MH',
        notes: 'Updated contact preference',
      }),
    });
    const patchCustJson = (await patchCustRes.json()) as { status: string; data: { location: string } };
    report(
      '1.4 Customer contact fields update succeeds',
      patchCustRes.status === 200 && patchCustJson.data?.location === 'Pune, MH',
      `Status: ${patchCustRes.status}`,
    );
  } catch (err) {
    report('1. Customer Module Endpoints', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 2: Quotation Module (Creation & State Machine Legal Transitions)
  // =========================================================================
  console.info('\n👉 TEST 2: Quotation Module State Machine Transitions');
  try {
    // 2.1 Create quotation with status CREATED
    const createQuoteRes = await fetch(`${API_BASE}/enquiries/${testEnquiryA.id}/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({
        amount: 250000.0,
        notes: 'Initial quotation for 50kW plant',
      }),
    });
    const createQuoteJson = (await createQuoteRes.json()) as { status: string; data: { id: string; status: string } };
    const quoteId = createQuoteJson.data?.id;

    report(
      '2.1 Create quotation succeeds with initial status CREATED',
      createQuoteRes.status === 201 && createQuoteJson.data?.status === QuotationStatus.CREATED,
      `Status: ${createQuoteRes.status}, QuoteStatus: ${createQuoteJson.data?.status}`,
    );

    // 2.2 Illegal state transition: CREATED -> ACCEPTED directly must fail with 400
    const illegalTransitionRes = await fetch(`${API_BASE}/quotations/${quoteId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({
        status: QuotationStatus.ACCEPTED,
      }),
    });
    report(
      '2.2 Illegal state transition (CREATED -> ACCEPTED) rejected with 400 Bad Request',
      illegalTransitionRes.status === 400,
      `Status: ${illegalTransitionRes.status}`,
    );

    // 2.3 Legal transition: CREATED -> SENT (sets sentAt and creates Activity)
    const sentTransitionRes = await fetch(`${API_BASE}/quotations/${quoteId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({
        status: QuotationStatus.SENT,
      }),
    });
    const sentJson = (await sentTransitionRes.json()) as { status: string; data: { status: string; sentAt: string } };

    // Verify activity record in DB
    const sentActivity = await prisma.activity.findFirst({
      where: {
        enquiryId: testEnquiryA.id,
        type: ActivityType.QUOTATION_SENT,
      },
    });

    report(
      '2.3 Legal transition (CREATED -> SENT) succeeds, sets sentAt, and creates Activity row',
      sentTransitionRes.status === 200 &&
        sentJson.data?.status === QuotationStatus.SENT &&
        Boolean(sentJson.data?.sentAt) &&
        Boolean(sentActivity),
      `Status: ${sentTransitionRes.status}, sentAt: ${sentJson.data?.sentAt}, Activity: ${Boolean(sentActivity)}`,
    );

    // 2.4 Legal transition: SENT -> ACCEPTED (sets respondedAt)
    const acceptedTransitionRes = await fetch(`${API_BASE}/quotations/${quoteId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({
        status: QuotationStatus.ACCEPTED,
      }),
    });
    const acceptedJson = (await acceptedTransitionRes.json()) as { status: string; data: { status: string; respondedAt: string } };

    report(
      '2.4 Legal transition (SENT -> ACCEPTED) succeeds and sets respondedAt',
      acceptedTransitionRes.status === 200 &&
        acceptedJson.data?.status === QuotationStatus.ACCEPTED &&
        Boolean(acceptedJson.data?.respondedAt),
      `Status: ${acceptedTransitionRes.status}, respondedAt: ${acceptedJson.data?.respondedAt}`,
    );

    // 2.5 List quotations for enquiry
    const listQuoteRes = await fetch(`${API_BASE}/enquiries/${testEnquiryA.id}/quotations`, {
      headers: { Authorization: `Bearer ${empAToken}` },
    });
    const listQuoteJson = (await listQuoteRes.json()) as { status: string; data: unknown[] };
    report(
      '2.5 List quotations for enquiry returns created quotations',
      listQuoteRes.status === 200 && Array.isArray(listQuoteJson.data) && listQuoteJson.data.length >= 1,
      `Status: ${listQuoteRes.status}, Count: ${listQuoteJson.data?.length}`,
    );
  } catch (err) {
    report('2. Quotation Module', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 3: Valid PDF upload succeeds (Security & S3 Key UUID)
  // =========================================================================
  console.info('\n👉 TEST 3: Valid PDF Upload');
  let uploadedAttachmentId = '';
  try {
    // Standard minimal valid PDF binary buffer
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF',
    );

    const form = new FormData();
    const blob = new Blob([validPdfBuffer], { type: 'application/pdf' });
    form.append('file', blob, 'proposal_v1.pdf');
    form.append('enquiryId', testEnquiryA.id);

    const uploadRes = await fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${empAToken}`,
      },
      body: form,
    });

    const uploadJson = (await uploadRes.json()) as {
      status: string;
      data: { id: string; fileName: string; fileType: string; fileKey: string };
    };

    uploadedAttachmentId = uploadJson.data?.id || '';

    // Storage key should be non-guessable UUID
    const isNonGuessableKey =
      uploadJson.data?.fileKey?.startsWith('attachments/') &&
      uploadJson.data?.fileKey?.length > 30 &&
      uploadJson.data?.fileName === 'proposal_v1.pdf';

    const dbRow = await prisma.attachment.findUnique({
      where: { id: uploadedAttachmentId },
    });

    report(
      '3. Valid PDF upload succeeds (201 Created), inspects magic numbers, and assigns non-guessable key',
      uploadRes.status === 201 && Boolean(isNonGuessableKey) && Boolean(dbRow),
      `Status: ${uploadRes.status}, Key: ${uploadJson.data?.fileKey}, DB Found: ${Boolean(dbRow)}`,
    );
  } catch (err) {
    report('3. Valid PDF upload', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 4: Disguised .exe renamed to .pdf is rejected (Magic Numbers Check)
  // =========================================================================
  console.info('\n👉 TEST 4: Spoofed Executable Rejection via Magic-Byte Signature');
  try {
    // Windows PE Executable binary header (MZ...)
    const exeBuffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
      0xff, 0xff, 0x00, 0x00, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const form = new FormData();
    // Claiming application/pdf and naming it invoice.pdf
    const blob = new Blob([exeBuffer], { type: 'application/pdf' });
    form.append('file', blob, 'invoice.pdf');
    form.append('enquiryId', testEnquiryA.id);

    const spoofRes = await fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${empAToken}`,
      },
      body: form,
    });

    report(
      '4. Disguised .exe renamed to .pdf rejected with 400 Bad Request via magic bytes check',
      spoofRes.status === 400,
      `Status: ${spoofRes.status}`,
    );
  } catch (err) {
    report('4. Spoofed Executable Rejection', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 5: File exceeding 10MB limit is rejected by multer middleware
  // =========================================================================
  console.info('\n👉 TEST 5: 10MB File Size Limit Enforcement');
  try {
    // 10.5 MB buffer
    const oversizedSize = 10.5 * 1024 * 1024;
    const oversizedBuffer = Buffer.alloc(oversizedSize);
    // Write PDF signature at start so it only fails on size
    oversizedBuffer.write('%PDF-1.4\n', 0, 'ascii');

    const form = new FormData();
    const blob = new Blob([oversizedBuffer], { type: 'application/pdf' });
    form.append('file', blob, 'huge_catalog.pdf');
    form.append('enquiryId', testEnquiryA.id);

    const sizeRes = await fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${empAToken}`,
      },
      body: form,
    });

    report(
      '5. File exceeding 10MB limit rejected by upload middleware with 400 Bad Request',
      sizeRes.status === 400,
      `Status: ${sizeRes.status}`,
    );
  } catch (err) {
    report('5. 10MB File Size Limit Enforcement', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 6: Employee without access cannot upload to or download enquiry attachments
  // =========================================================================
  console.info('\n👉 TEST 6: Anti-Enumeration & Scoped Access (404 Not Found)');
  try {
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n70\n%%EOF',
    );

    // 6.1 Unauthorized employee attempts upload to Enquiry A
    const form = new FormData();
    const blob = new Blob([validPdfBuffer], { type: 'application/pdf' });
    form.append('file', blob, 'unauthorized.pdf');
    form.append('enquiryId', testEnquiryA.id);

    const unauthorizedUploadRes = await fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${empBToken}`,
      },
      body: form,
    });

    report(
      '6.1 Employee B cannot upload attachment to Enquiry A (404 Not Found)',
      unauthorizedUploadRes.status === 404,
      `Status: ${unauthorizedUploadRes.status}`,
    );

    // 6.2 Unauthorized employee attempts download of Enquiry A attachment
    const unauthorizedDownloadRes = await fetch(
      `${API_BASE}/attachments/${uploadedAttachmentId}/download`,
      {
        headers: {
          Authorization: `Bearer ${empBToken}`,
        },
      },
    );

    report(
      '6.2 Employee B cannot download Enquiry A attachment (404 Not Found)',
      unauthorizedDownloadRes.status === 404,
      `Status: ${unauthorizedDownloadRes.status}`,
    );
  } catch (err) {
    report('6. Anti-Enumeration Access Scoping', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 7: Download Presigned URL with 5-Minute Expiry Verification
  // =========================================================================
  console.info('\n👉 TEST 7: Signed Download URL & Expiration Validation');
  try {
    const downloadRes = await fetch(
      `${API_BASE}/attachments/${uploadedAttachmentId}/download`,
      {
        headers: {
          Authorization: `Bearer ${empAToken}`,
        },
      },
    );

    const downloadJson = (await downloadRes.json()) as {
      status: string;
      data: { downloadUrl: string; expiresIn: number; fileName: string };
    };

    const downloadUrl = downloadJson.data?.downloadUrl || '';
    const expiresIn = downloadJson.data?.expiresIn;

    // Check query params for AWS SigV4 expiration parameters
    const parsedUrl = new URL(downloadUrl);
    const hasAmzExpires = parsedUrl.searchParams.get('X-Amz-Expires') === '300';
    const hasSignature =
      Boolean(parsedUrl.searchParams.get('X-Amz-Signature')) &&
      Boolean(parsedUrl.searchParams.get('X-Amz-Algorithm'));

    report(
      '7. Download presigned URL generated with valid signature and 5-minute (300s) expiry',
      downloadRes.status === 200 && expiresIn === 300 && hasAmzExpires && hasSignature,
      `Status: ${downloadRes.status}, expiresIn: ${expiresIn}, X-Amz-Expires: ${parsedUrl.searchParams.get('X-Amz-Expires')}`,
    );
  } catch (err) {
    report('7. Download Presigned URL Validation', false, (err as Error).message);
  }

  // =========================================================================
  // TEST 8: Attachment Deletion (Manager+ Scoping, Anti-Enumeration & AuditLog)
  // =========================================================================
  console.info('\n👉 TEST 8: Attachment Deletion (Manager+ Scoping & Anti-Enumeration)');
  try {
    // 8.1 Employee cannot delete attachment (403 Forbidden via requireRole)
    const empDeleteRes = await fetch(`${API_BASE}/attachments/${uploadedAttachmentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${empAToken}`,
      },
    });

    report(
      '8.1 Employee cannot delete attachment (403 Forbidden)',
      empDeleteRes.status === 403,
      `Status: ${empDeleteRes.status}`,
    );

    // 8.2 Second Manager with separate subordinate tree gets 404 (not 403, anti-enumeration pattern)
    const mgr2DeleteRes = await fetch(`${API_BASE}/attachments/${uploadedAttachmentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${manager2Token}`,
      },
    });

    report(
      '8.2 Second Manager (separate tree) attempting to delete attachment gets 404 Not Found (anti-enumeration)',
      mgr2DeleteRes.status === 404,
      `Status: ${mgr2DeleteRes.status}`,
    );

    // 8.3 First Manager (supervisor in subordinate tree) deletes attachment (200 OK)
    const mgrDeleteRes = await fetch(`${API_BASE}/attachments/${uploadedAttachmentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    });

    // Check DB row deleted
    const dbDeletedRow = await prisma.attachment.findUnique({
      where: { id: uploadedAttachmentId },
    });

    // Check AuditLog row created
    const auditLogRow = await prisma.auditLog.findFirst({
      where: {
        action: 'ATTACHMENT_DELETED',
        entityId: uploadedAttachmentId,
      },
    });

    report(
      '8.3 Team Manager deletes attachment: DB row removed and AuditLog entry recorded',
      mgrDeleteRes.status === 200 && dbDeletedRow === null && Boolean(auditLogRow),
      `Status: ${mgrDeleteRes.status}, DB Row Exists: ${Boolean(dbDeletedRow)}, AuditLog Found: ${Boolean(auditLogRow)}`,
    );

    // 8.4 Confirm ADMIN remains unrestricted: Admin can delete attachment from any team
    // Upload a new attachment for Employee A's customer
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n70\n%%EOF',
    );
    const form = new FormData();
    const blob = new Blob([validPdfBuffer], { type: 'application/pdf' });
    form.append('file', blob, 'admin_test.pdf');
    form.append('enquiryId', testEnquiryA.id);

    const adminUploadRes = await fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${empAToken}` },
      body: form,
    });
    const adminUploadJson = (await adminUploadRes.json()) as { data: { id: string } };
    const adminTargetAttachmentId = adminUploadJson.data?.id;

    const adminDeleteRes = await fetch(`${API_BASE}/attachments/${adminTargetAttachmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    report(
      '8.4 ADMIN remains unrestricted and can delete attachment across any team',
      adminDeleteRes.status === 200,
      `Status: ${adminDeleteRes.status}`,
    );
  } catch (err) {
    report('8. Attachment Deletion', false, (err as Error).message);
  }

  // Cleanup test entities (except append-only Activity / AuditLog which cannot be deleted)
  console.info('\n🧹 Cleaning up test records...');
  try {
    await prisma.quotation.deleteMany({
      where: { enquiryId: testEnquiryA.id },
    });
    await prisma.enquiry.delete({
      where: { id: testEnquiryA.id },
    });
    await prisma.customer.deleteMany({
      where: {
        id: { in: [testCustomerA.id] },
      },
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
