import dotenv from 'dotenv';
import path from 'path';
import { Role, Priority, EnquiryStatus, ActivityType } from '@prisma/client';
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

async function uploadCsv(token: string, csvContent: string, fileName = 'test.csv') {
  const form = new FormData();
  const blob = new Blob([Buffer.from(csvContent, 'utf-8')], { type: 'text/csv' });
  form.append('file', blob, fileName);

  const res = await fetch(`${API_BASE}/import/enquiries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const json = (await res.json()) as {
    status: string;
    message?: string;
    data?: {
      totalRows: number;
      imported: number;
      skipped: number;
      errors: { row: number; reason: string }[];
    };
  };

  return { status: res.status, json };
}

async function runTests(): Promise<void> {
  console.info('===========================================================');
  console.info('   BULK CSV IMPORT FOR CUSTOMERS & ENQUIRIES TEST SUITE    ');
  console.info('===========================================================');
  console.info(`Target Backend: ${API_BASE}\n`);

  try {
    // 0. Authenticate test personas
    console.info('🔑 Authenticating organizational roles...');
    const adminToken = await loginUser('admin@hbcrm.local', 'AdminPassword123!');
    const manager1Token = await loginUser('rajesh.verma@hbcrm.local', 'Password123!');
    const employee1Token = await loginUser('priya.sharma@hbcrm.local', 'Password123!');

    // Fetch Priya user record
    const priyaUser = await prisma.user.findUnique({
      where: { email: 'priya.sharma@hbcrm.local' },
    });
    // Fetch Sneha user record (reports to Vikram, not Rajesh)
    const snehaUser = await prisma.user.findUnique({
      where: { email: 'sneha.reddy@hbcrm.local' },
    });

    if (!priyaUser || !snehaUser) {
      throw new Error('Required test users (Priya or Sneha) not found in database.');
    }

    const testTimestamp = Date.now();
    const phoneValid1 = `9711${String(testTimestamp).slice(-6)}`;
    const phoneValid2 = `9722${String(testTimestamp).slice(-6)}`;
    const phoneValid3 = `9733${String(testTimestamp).slice(-6)}`;
    const phoneValid4 = `9744${String(testTimestamp).slice(-6)}`;

    // =========================================================================
    // 1. ROLE-GATED SECURITY: EMPLOYEE CANNOT IMPORT
    // =========================================================================
    console.info('\n--- 1. ROLE-GATED ACCESS CONTROL ---');
    const dummyCsv = `Customer Name,Company,Phone\nTest Corp,Test,${phoneValid1}`;
    const empAttempt = await uploadCsv(employee1Token, dummyCsv);
    report(
      '1.1 Employee attempting POST /import/enquiries is rejected with HTTP 403 Forbidden',
      empAttempt.status === 403,
      `Status: ${empAttempt.status}, Body: ${JSON.stringify(empAttempt.json)}`,
    );

    // =========================================================================
    // 2. VALID CSV IMPORT WITH AUDIT LOG & ACTIVITY TRAIL
    // =========================================================================
    console.info('\n--- 2. VALID CSV IMPORT & AUDIT TRAIL VERIFICATION ---');
    const validCsv = [
      'Customer Name,Company,Phone,Email,Location,Source,Product,Priority,Expected Value,Remarks,Assigned To',
      `Arun Kumar,Import Acme Corp,${phoneValid1},arun@importacme.com,Mumbai,Website,Enterprise CRM,HIGH,450000,Lead from CSV import,priya.sharma@hbcrm.local`,
      `Bina Shah,Import Zenith Ltd,${phoneValid2},bina@importzenith.com,Pune,Trade Show,Inventory Tracking,MEDIUM,120000,Met at logistics expo,`,
    ].join('\n');

    const validImport = await uploadCsv(manager1Token, validCsv);

    report(
      '2.1 Manager 1 imports valid CSV successfully (HTTP 200 OK)',
      validImport.status === 200 && validImport.json.status === 'success',
      `Status: ${validImport.status}`,
    );

    const importData = validImport.json.data;
    report(
      '2.2 Import result reports totalRows=2, imported=2, skipped=0, errors=[]',
      importData?.totalRows === 2 &&
        importData?.imported === 2 &&
        importData?.skipped === 0 &&
        importData?.errors?.length === 0,
      `Result: ${JSON.stringify(importData)}`,
    );

    // Verify Customer in DB
    const customer1 = await prisma.customer.findFirst({
      where: { phone: phoneValid1 },
    });
    report(
      '2.3 Customer created in database with normalized phone and company',
      Boolean(customer1) && customer1?.companyName === 'Import Acme Corp',
      `Customer: ${JSON.stringify(customer1)}`,
    );

    // Verify Customer AuditLog
    const customerAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Customer',
        entityId: customer1?.id,
        action: 'CREATE',
      },
    });
    const customerAuditMeta = customerAudit?.metadata as { source?: string } | null;
    report(
      '2.4 Customer has AuditLog entry tagged with metadata source: "CSV_IMPORT"',
      Boolean(customerAudit) && customerAuditMeta?.source === 'CSV_IMPORT',
      `AuditLog: ${JSON.stringify(customerAudit)}`,
    );

    // Verify Enquiry in DB
    const enquiry1 = await prisma.enquiry.findFirst({
      where: { phone: phoneValid1 },
      include: { assignedTo: true },
    });
    report(
      '2.5 Enquiry created in database with status NEW, priority HIGH, expectedValue 450000, assigned to Priya',
      Boolean(enquiry1) &&
        enquiry1?.status === EnquiryStatus.NEW &&
        enquiry1?.priority === Priority.HIGH &&
        Number(enquiry1?.expectedValue) === 450000 &&
        enquiry1?.assignedToId === priyaUser.id,
      `Enquiry: ${JSON.stringify(enquiry1)}`,
    );

    // Verify Enquiry Activity trail
    const activity1 = await prisma.activity.findFirst({
      where: {
        enquiryId: enquiry1?.id,
        type: ActivityType.ENQUIRY_ASSIGNED,
      },
    });
    report(
      '2.6 Activity row created with type ENQUIRY_ASSIGNED for assigned enquiry',
      Boolean(activity1),
      `Activity: ${JSON.stringify(activity1)}`,
    );

    // Verify StatusHistory trail
    const statusHist1 = await prisma.statusHistory.findFirst({
      where: { enquiryId: enquiry1?.id },
    });
    report(
      '2.7 StatusHistory row created with oldStatus null -> NEW',
      Boolean(statusHist1) &&
        statusHist1?.oldStatus === null &&
        statusHist1?.newStatus === EnquiryStatus.NEW,
      `StatusHistory: ${JSON.stringify(statusHist1)}`,
    );

    // Verify Enquiry AuditLog
    const enquiryAudit1 = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Enquiry',
        entityId: enquiry1?.id,
        action: 'CREATE',
      },
    });
    const enquiryAuditMeta = enquiryAudit1?.metadata as { source?: string } | null;
    report(
      '2.8 Enquiry has AuditLog entry tagged with metadata source: "CSV_IMPORT"',
      Boolean(enquiryAudit1) && enquiryAuditMeta?.source === 'CSV_IMPORT',
      `AuditLog: ${JSON.stringify(enquiryAudit1)}`,
    );

    // =========================================================================
    // 3. CUSTOMER DEDUPLICATION BY PHONE NUMBER
    // =========================================================================
    console.info('\n--- 3. NATURAL DEDUPLICATION BY PHONE NUMBER ---');
    const repeatCustomerCsv = [
      'Customer Name,Company,Phone,Product,Priority',
      `Arun Kumar Update,Import Acme Corp,${phoneValid1},Additional Software Licenses,LOW`,
    ].join('\n');

    const repeatImport = await uploadCsv(manager1Token, repeatCustomerCsv);
    report(
      '3.1 Importing a new enquiry for an existing customer phone succeeds',
      repeatImport.status === 200 && repeatImport.json.data?.imported === 1,
      `Status: ${repeatImport.status}`,
    );

    const customerRowsCount = await prisma.customer.count({
      where: { phone: phoneValid1 },
    });
    report(
      '3.2 Existing customer record was reused (phone match), exactly 1 Customer row exists',
      customerRowsCount === 1,
      `Count for ${phoneValid1}: ${customerRowsCount}`,
    );

    const newEnquiry = await prisma.enquiry.findFirst({
      where: {
        phone: phoneValid1,
        product: 'Additional Software Licenses',
      },
    });
    report(
      '3.3 New enquiry correctly points to the existing Customer ID',
      Boolean(newEnquiry) && newEnquiry?.customerId === customer1?.id,
      `Enquiry customerId: ${newEnquiry?.customerId}, Expected: ${customer1?.id}`,
    );

    // =========================================================================
    // 4. FAULT TOLERANCE: BAD ROW SKIPPED & GOOD ROWS IMPORTED
    // =========================================================================
    console.info('\n--- 4. FAULT TOLERANT IMPORT (PARTIAL FAILURE) ---');
    const mixedCsv = [
      'Customer Name,Company,Phone,Priority',
      `Good Customer 1,Alpha Co,${phoneValid3},HIGH`,
      'Bad Customer Missing Phone,Beta Co,,MEDIUM', // Row 3: missing phone!
      `Good Customer 2,Gamma Co,${phoneValid4},LOW`,
    ].join('\n');

    const mixedImport = await uploadCsv(manager1Token, mixedCsv);
    report(
      '4.1 Mixed CSV import completes with HTTP 200 (does not abort entire batch)',
      mixedImport.status === 200 && mixedImport.json.status === 'success',
      `Status: ${mixedImport.status}`,
    );

    const mixedData = mixedImport.json.data;
    report(
      '4.2 Summary reports totalRows=3, imported=2, skipped=1',
      mixedData?.totalRows === 3 && mixedData?.imported === 2 && mixedData?.skipped === 1,
      `Result: ${JSON.stringify(mixedData)}`,
    );

    const errorItem = mixedData?.errors?.[0];
    report(
      '4.3 Error details identify exact row (Row 3) and reason "Phone number is required"',
      errorItem?.row === 3 && Boolean(errorItem?.reason?.includes('Phone number is required')),
      `Error: ${JSON.stringify(errorItem)}`,
    );

    const goodEnquiry1 = await prisma.enquiry.findFirst({ where: { phone: phoneValid3 } });
    const goodEnquiry2 = await prisma.enquiry.findFirst({ where: { phone: phoneValid4 } });
    report(
      '4.4 Good rows (phoneValid3 & phoneValid4) committed successfully to the database',
      Boolean(goodEnquiry1) && Boolean(goodEnquiry2),
      `Enquiry 1: ${Boolean(goodEnquiry1)}, Enquiry 2: ${Boolean(goodEnquiry2)}`,
    );

    // =========================================================================
    // 5. HIERARCHICAL ASSIGNMENT RULES (MANAGER CANNOT ASSIGN OUTSIDE TREE)
    // =========================================================================
    console.info('\n--- 5. HIERARCHY SCOPING ON ASSIGNMENT ---');
    const invalidAssigneePhone = `9755${String(testTimestamp).slice(-6)}`;
    const invalidAssigneeCsv = [
      'Customer Name,Company,Phone,Assigned To',
      // Sneha Reddy is subordinate of Vikram Singh, outside Rajesh Verma's tree!
      `Out of Tree Lead,Delta Inc,${invalidAssigneePhone},sneha.reddy@hbcrm.local`,
    ].join('\n');

    const invalidAssignImport = await uploadCsv(manager1Token, invalidAssigneeCsv);
    report(
      '5.1 Manager 1 attempting to assign outside subordinate tree reports row failure',
      invalidAssignImport.status === 200 &&
        invalidAssignImport.json.data?.skipped === 1 &&
        Boolean(invalidAssignImport.json.data?.errors[0]?.reason?.includes('reporting hierarchy')),
      `Errors: ${JSON.stringify(invalidAssignImport.json.data?.errors)}`,
    );

    // Admin CAN assign to anyone across trees
    const adminAssignImport = await uploadCsv(adminToken, invalidAssigneeCsv);
    report(
      '5.2 Admin importing the same CSV assigns to Sneha Reddy successfully (unrestricted hierarchy)',
      adminAssignImport.status === 200 && adminAssignImport.json.data?.imported === 1,
      `Admin Result: ${JSON.stringify(adminAssignImport.json.data)}`,
    );

    // =========================================================================
    // 6. MAXIMUM 500 ROW CAP ENFORCEMENT
    // =========================================================================
    console.info('\n--- 6. BATCH SIZE LIMIT ENFORCEMENT (500 ROWS) ---');
    const oversizedRows = ['Customer Name,Company,Phone'];
    for (let i = 1; i <= 501; i++) {
      oversizedRows.push(`Customer ${i},Company ${i},990000${String(i).padStart(4, '0')}`);
    }
    const oversizedCsv = oversizedRows.join('\n');

    const oversizedImport = await uploadCsv(manager1Token, oversizedCsv);
    report(
      '6.1 Uploading CSV with 501 rows is rejected with HTTP 400 Bad Request',
      oversizedImport.status === 400 &&
        Boolean(oversizedImport.json.message?.includes('exceeds the maximum limit of 500 rows')),
      `Status: ${oversizedImport.status}, Message: ${oversizedImport.json.message}`,
    );

    // =========================================================================
    // 7. CSV FORMULA INJECTION PROTECTION (=, +, -, @, \t, \r)
    // =========================================================================
    console.info('\n--- 7. CSV FORMULA INJECTION PROTECTION ---');
    const injectionPhone1 = `9761${String(testTimestamp).slice(-6)}`;
    const injectionPhone2 = `9762${String(testTimestamp).slice(-6)}`;
    const injectionPhone3 = `9763${String(testTimestamp).slice(-6)}`;

    const injectionCsv = [
      'Customer Name,Company,Phone,Remarks,Product',
      `"=HYPERLINK(""http://evil.com"",""Phish"")",Acme Labs,${injectionPhone1},=1+1,=CMD|calc`,
      `Safe Corp,+cmd|'/c calc'!A0,${injectionPhone2},+cmd|'/c calc'!A0,-Vulnerable Product`,
      `@Admin Org,Regular LLC,${injectionPhone3},\t=SUM(A1:A10),Normal Item`,
    ].join('\n');

    const injectionImport = await uploadCsv(manager1Token, injectionCsv);
    report(
      '7.1 CSV containing formula injection payloads (=, +, -, @, \\t) imports successfully (HTTP 200)',
      injectionImport.status === 200 && injectionImport.json.data?.imported === 3,
      `Result: ${JSON.stringify(injectionImport.json.data)}`,
    );

    const injEnquiry1 = await prisma.enquiry.findFirst({ where: { phone: injectionPhone1 } });
    const injEnquiry2 = await prisma.enquiry.findFirst({ where: { phone: injectionPhone2 } });
    const injEnquiry3 = await prisma.enquiry.findFirst({ where: { phone: injectionPhone3 } });

    report(
      '7.2 Remarks containing =1+1 is neutralized with single quote prefix ("\'=1+1")',
      injEnquiry1?.remarks === "'=1+1",
      `Actual remarks: "${injEnquiry1?.remarks}"`,
    );

    report(
      '7.3 Remarks containing +cmd|\'/c calc\'!A0 is neutralized with single quote prefix ("\'+cmd|\'/c calc\'!A0")',
      injEnquiry2?.remarks === "'+cmd|'/c calc'!A0",
      `Actual remarks: "${injEnquiry2?.remarks}"`,
    );

    report(
      '7.4 Remarks starting with tab/formula "\\t=SUM(A1:A10)" is neutralized with single quote prefix ("\'=SUM(A1:A10)")',
      injEnquiry3?.remarks === "'=SUM(A1:A10)",
      `Actual remarks: "${injEnquiry3?.remarks}"`,
    );

    const injCustomer1 = await prisma.customer.findFirst({ where: { phone: injectionPhone1 } });
    const injCustomer2 = await prisma.customer.findFirst({ where: { phone: injectionPhone2 } });
    const injCustomer3 = await prisma.customer.findFirst({ where: { phone: injectionPhone3 } });

    report(
      '7.5 Customer Name & Company starting with =, +, @ are safely sanitized with single quote prefix',
      injCustomer1?.name === '\'=HYPERLINK("http://evil.com","Phish")' &&
        injCustomer2?.companyName === "'+cmd|'/c calc'!A0" &&
        injCustomer3?.name === "'@Admin Org",
      `Customer1 Name: ${injCustomer1?.name}, Customer2 Company: ${injCustomer2?.companyName}, Customer3 Name: ${injCustomer3?.name}`,
    );

    // =========================================================================
    // 8. AMBIGUOUS ASSIGNEE MATCH PROTECTION (DUPLICATE NAMES REQUIRE EMAIL)
    // =========================================================================
    console.info('\n--- 8. AMBIGUOUS ASSIGNEE MATCH PROTECTION ---');
    const duplicateUserName = `Shared Name ${String(testTimestamp).slice(-4)}`;
    const duplicateUserEmail1 = `dup1_${testTimestamp}@hbcrm.local`;
    const duplicateUserEmail2 = `dup2_${testTimestamp}@hbcrm.local`;

    const rajeshUser = await prisma.user.findUnique({
      where: { email: 'rajesh.verma@hbcrm.local' },
    });

    const dupUser1 = await prisma.user.create({
      data: {
        name: duplicateUserName,
        email: duplicateUserEmail1,
        passwordHash: 'placeholder_hash',
        role: Role.EMPLOYEE,
        supervisorId: rajeshUser?.id,
        isActive: true,
      },
    });

    const dupUser2 = await prisma.user.create({
      data: {
        name: duplicateUserName,
        email: duplicateUserEmail2,
        passwordHash: 'placeholder_hash',
        role: Role.EMPLOYEE,
        supervisorId: rajeshUser?.id,
        isActive: true,
      },
    });

    const ambiguousPhone1 = `9771${String(testTimestamp).slice(-6)}`;
    const ambiguousCsv = [
      'Customer Name,Company,Phone,Assigned To',
      `Ambiguous Test Corp,Ambiguous LLC,${ambiguousPhone1},${duplicateUserName}`,
    ].join('\n');

    const ambiguousImport = await uploadCsv(manager1Token, ambiguousCsv);

    report(
      '8.1 CSV specifying ambiguous assignee name fails that row with clear "Ambiguous assignee" error',
      ambiguousImport.status === 200 &&
        ambiguousImport.json.data?.skipped === 1 &&
        Boolean(ambiguousImport.json.data?.errors[0]?.reason?.includes('Ambiguous assignee')) &&
        Boolean(ambiguousImport.json.data?.errors[0]?.reason?.includes('email address')),
      `Error: ${JSON.stringify(ambiguousImport.json.data?.errors)}`,
    );

    const disambiguatedPhone = `9772${String(testTimestamp).slice(-6)}`;
    const disambiguatedCsv = [
      'Customer Name,Company,Phone,Assigned To',
      `Disambiguated Corp,Disambiguated LLC,${disambiguatedPhone},${duplicateUserEmail1}`,
    ].join('\n');

    const disambiguatedImport = await uploadCsv(manager1Token, disambiguatedCsv);
    report(
      '8.2 Disambiguating by providing unique email address succeeds and imports row',
      disambiguatedImport.status === 200 && disambiguatedImport.json.data?.imported === 1,
      `Result: ${JSON.stringify(disambiguatedImport.json.data)}`,
    );

    const disambiguatedEnquiry = await prisma.enquiry.findFirst({
      where: { phone: disambiguatedPhone },
    });
    report(
      '8.3 Disambiguated enquiry is assigned to the exact user matching unique email',
      disambiguatedEnquiry?.assignedToId === dupUser1.id,
      `Assigned user id: ${disambiguatedEnquiry?.assignedToId}, Expected: ${dupUser1.id}`,
    );

    await prisma.user.updateMany({
      where: { id: { in: [dupUser1.id, dupUser2.id] } },
      data: { isActive: false },
    });

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
