import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'http://localhost:5001/api';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${description}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${description}`);
    if (details) console.error(`         \x1b[33m${details}\x1b[0m`);
  }
}

async function request(endpoint: string, options: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function run() {
  console.log('================================================================');
  console.log('  ENTERPRISE HB CRM: 22-ENQUIRY FULL SYSTEM END-TO-END TEST');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. Authenticate Roles (Admin, Manager, Employee)
  // -------------------------------------------------------------
  console.log('--- 1. Authenticating Roles (Admin, Manager, Employee) ---');

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'gauravdubey964@gmail.com', password: 'AdminPassword123!' }),
  });
  assert('Super Admin Login (gauravdubey964@gmail.com)', adminLogin.ok && Boolean(adminLogin.data?.data?.accessToken));
  const adminToken = adminLogin.data?.data?.accessToken;

  const managerLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'gauravdwivedi875@gmail.com', password: 'Password123!' }),
  });
  assert('Manager Login (Rohit Kumar)', managerLogin.ok && Boolean(managerLogin.data?.data?.accessToken));
  const managerToken = managerLogin.data?.data?.accessToken;
  const managerUser = managerLogin.data?.data?.user;

  const employeeLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'sonu@gmail.com', password: 'Password123!' }),
  });
  assert('Employee Login (Sonu Kumar)', employeeLogin.ok && Boolean(employeeLogin.data?.data?.accessToken));
  const employeeToken = employeeLogin.data?.data?.accessToken;
  const employeeUser = employeeLogin.data?.data?.user;

  // RBAC Negative Test: Employee accessing Admin User Management
  const forbiddenCheck = await request('/users', { method: 'GET' }, employeeToken);
  assert('RBAC Security: Employee blocked from Admin User Management (HTTP 403)', forbiddenCheck.status === 403);

  // -------------------------------------------------------------
  // 2. Provisioning 22 Diverse Enquiries Across All 8 Pipeline Stages
  // -------------------------------------------------------------
  console.log('\n--- 2. Creating 22 Enquiries across All 8 Pipeline Stages & Priorities ---');

  interface EnquiryTemplate {
    title: string;
    product: string;
    stage: 'NEW' | 'ASSIGNED' | 'CONTACTED' | 'FOLLOW_UP_REQUIRED' | 'QUOTATION_SENT' | 'NEGOTIATION' | 'CONVERTED' | 'LOST' | 'ON_HOLD';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    source: string;
    expectedValue: number;
    assignedToId?: string;
    customer: {
      name: string;
      companyName: string;
      phone: string;
      email: string;
      location: string;
    };
    hasFollowup?: boolean;
    quotationAmount?: number;
  }

  const templates: EnquiryTemplate[] = [
    // --- STAGE: NEW (3) ---
    {
      title: 'Enterprise ERP Modernization',
      product: 'ERP Software Suite',
      stage: 'NEW',
      priority: 'HIGH',
      source: 'WEBSITE',
      expectedValue: 850000,
      assignedToId: employeeUser.id,
      customer: { name: 'Vikram Mehta', companyName: 'Mehta Logistics Ltd', phone: '9811001101', email: 'vikram@mehtalogistics.com', location: 'Mumbai' },
    },
    {
      title: 'Supply Chain Analytics Suite',
      product: 'SCM Cloud',
      stage: 'NEW',
      priority: 'HIGH',
      source: 'REFERRAL',
      expectedValue: 1200000,
      assignedToId: managerUser.id,
      customer: { name: 'Anita Rao', companyName: 'Apex Retails India', phone: '9811001102', email: 'anita@apexretails.com', location: 'Bengaluru' },
    },
    {
      title: 'Automated Billing Plugin',
      product: 'Fintech Billing Engine',
      stage: 'NEW',
      priority: 'LOW',
      source: 'COLD_CALL',
      expectedValue: 150000,
      assignedToId: employeeUser.id,
      customer: { name: 'Karan Shah', companyName: 'Shah & Sons Enterprises', phone: '9811001103', email: 'karan@shahandco.com', location: 'Ahmedabad' },
    },

    // --- STAGE: CONTACTED (3) ---
    {
      title: 'Warehouse IoT Monitoring',
      product: 'Industrial IoT Platform',
      stage: 'CONTACTED',
      priority: 'MEDIUM',
      source: 'EXHIBITION',
      expectedValue: 420000,
      assignedToId: employeeUser.id,
      customer: { name: 'Pooja Hegde', companyName: 'Deccan Warehousing Solutions', phone: '9811001104', email: 'pooja@deccanware.com', location: 'Hyderabad' },
      hasFollowup: true,
    },
    {
      title: 'HRMS Cloud Migration',
      product: 'HR Cloud Pro',
      stage: 'CONTACTED',
      priority: 'HIGH',
      source: 'GOOGLE_ADS',
      expectedValue: 600000,
      assignedToId: employeeUser.id,
      customer: { name: 'Ramesh Nair', companyName: 'Kerala Infotech Corp', phone: '9811001105', email: 'ramesh@keralainfotech.com', location: 'Kochi' },
      hasFollowup: true,
    },
    {
      title: 'Fleet Management GPS System',
      product: 'Telematics Vehicle Tracking',
      stage: 'CONTACTED',
      priority: 'LOW',
      source: 'INBOUND_EMAIL',
      expectedValue: 280000,
      assignedToId: managerUser.id,
      customer: { name: 'Sanjay Dutt', companyName: 'Express Cabs Network', phone: '9811001106', email: 'sanjay@expresscabs.com', location: 'Pune' },
    },

    // --- STAGE: FOLLOW_UP_REQUIRED (3) ---
    {
      title: 'E-commerce Custom Marketplace',
      product: 'E-commerce Engine B2B',
      stage: 'FOLLOW_UP_REQUIRED',
      priority: 'HIGH',
      source: 'LINKEDIN',
      expectedValue: 1500000,
      assignedToId: employeeUser.id,
      customer: { name: 'Neha Chawla', companyName: 'Urban Trends Fashion Ltd', phone: '9811001107', email: 'neha@urbantrends.in', location: 'Delhi' },
      hasFollowup: true,
    },
    {
      title: 'Healthcare Patient Portal',
      product: 'MedTech Suite EHR',
      stage: 'FOLLOW_UP_REQUIRED',
      priority: 'HIGH',
      source: 'DIRECT_CALL',
      expectedValue: 950000,
      assignedToId: employeeUser.id,
      customer: { name: 'Dr. Ashok Sen', companyName: 'CarePlus Multispeciality Hospitals', phone: '9811001108', email: 'dr.sen@careplushospitals.org', location: 'Kolkata' },
      hasFollowup: true,
    },
    {
      title: 'Banking Document AI Engine',
      product: 'DocuAI OCR System',
      stage: 'FOLLOW_UP_REQUIRED',
      priority: 'MEDIUM',
      source: 'REFERRAL',
      expectedValue: 2200000,
      assignedToId: managerUser.id,
      customer: { name: 'Manish Tiwari', companyName: 'Progressive Finance Co', phone: '9811001109', email: 'manish@progfin.com', location: 'Mumbai' },
    },

    // --- STAGE: QUOTATION_SENT (3) ---
    {
      title: 'Multi-Branch Inventory POS',
      product: 'POS & Cloud Billing',
      stage: 'QUOTATION_SENT',
      priority: 'HIGH',
      source: 'WEBSITE',
      expectedValue: 750000,
      assignedToId: employeeUser.id,
      customer: { name: 'Gopal Krishnan', companyName: 'Heritage Supermarkets', phone: '9811001110', email: 'gopal@heritageshop.in', location: 'Chennai' },
      quotationAmount: 720000,
      hasFollowup: true,
    },
    {
      title: 'Real Estate Lead CRM Integration',
      product: 'Realty Engine Cloud',
      stage: 'QUOTATION_SENT',
      priority: 'MEDIUM',
      source: 'EXHIBITION',
      expectedValue: 1100000,
      assignedToId: employeeUser.id,
      customer: { name: 'Rajiv Singhania', companyName: 'Skyline Luxury Builders', phone: '9811001111', email: 'rajiv@skylinegroup.co.in', location: 'Gurugram' },
      quotationAmount: 1050000,
    },
    {
      title: 'Omnichannel Customer Support Helpdesk',
      product: 'Helpdesk 360 Suite',
      stage: 'QUOTATION_SENT',
      priority: 'LOW',
      source: 'GOOGLE_ADS',
      expectedValue: 350000,
      assignedToId: managerUser.id,
      customer: { name: 'Divya Joshi', companyName: 'QuickFix Electronics Services', phone: '9811001112', email: 'divya@quickfix.co.in', location: 'Indore' },
      quotationAmount: 340000,
      hasFollowup: true,
    },

    // --- STAGE: NEGOTIATION (3) ---
    {
      title: 'Manufacturing MES Modernization',
      product: 'MES Factory Automation System',
      stage: 'NEGOTIATION',
      priority: 'HIGH',
      source: 'DIRECT_CALL',
      expectedValue: 3200000,
      assignedToId: employeeUser.id,
      customer: { name: 'Harish Chandra', companyName: 'Bharat Auto Components Ltd', phone: '9811001113', email: 'harish@bharatauto.com', location: 'Faridabad' },
      quotationAmount: 3000000,
      hasFollowup: true,
    },
    {
      title: 'Pharma Cold Chain Temperature Monitoring',
      product: 'PharmaTrack IoT Sensors',
      stage: 'NEGOTIATION',
      priority: 'HIGH',
      source: 'REFERRAL',
      expectedValue: 1800000,
      assignedToId: employeeUser.id,
      customer: { name: 'Dr. Sunita Reddy', companyName: 'BioZen Pharmaceuticals', phone: '9811001114', email: 'sunita@biozen.in', location: 'Hyderabad' },
      quotationAmount: 1750000,
    },
    {
      title: 'Hotel Booking & Guest Loyalty Engine',
      product: 'Hospitality ERP Suite',
      stage: 'NEGOTIATION',
      priority: 'MEDIUM',
      source: 'WEBSITE',
      expectedValue: 880000,
      assignedToId: managerUser.id,
      customer: { name: 'Alok Mathur', companyName: 'Royal Orchid Luxury Resorts', phone: '9811001115', email: 'alok@royalorchid.in', location: 'Jaipur' },
      quotationAmount: 850000,
      hasFollowup: true,
    },

    // --- STAGE: CONVERTED (3) ---
    {
      title: 'EdTech Student Information System',
      product: 'EduCampus Pro Suite',
      stage: 'CONVERTED',
      priority: 'HIGH',
      source: 'LINKEDIN',
      expectedValue: 1400000,
      assignedToId: employeeUser.id,
      customer: { name: 'Prof. Mohan Das', companyName: 'St. Xavier Global Academy', phone: '9811001116', email: 'admin@stxavierglobal.edu', location: 'Goa' },
      quotationAmount: 1350000,
    },
    {
      title: 'Digital Lending Risk Scoring Module',
      product: 'CreditScore Engine AI',
      stage: 'CONVERTED',
      priority: 'HIGH',
      source: 'REFERRAL',
      expectedValue: 2700000,
      assignedToId: employeeUser.id,
      customer: { name: 'Tanmay Bhatt', companyName: 'FinNova NBFC Ltd', phone: '9811001117', email: 'tanmay@finnovafin.com', location: 'Mumbai' },
      quotationAmount: 2700000,
    },
    {
      title: 'Retail Loyalty Points & Rewards App',
      product: 'Loyalty Cloud Engine',
      stage: 'CONVERTED',
      priority: 'MEDIUM',
      source: 'WEBSITE',
      expectedValue: 650000,
      assignedToId: managerUser.id,
      customer: { name: 'Preeti Deshmukh', companyName: 'StyleHub Chain Boutiques', phone: '9811001118', email: 'preeti@stylehub.in', location: 'Nagpur' },
      quotationAmount: 620000,
    },

    // --- STAGE: LOST (2) ---
    {
      title: 'Legal Practice Management Software',
      product: 'LexPro Case Suite',
      stage: 'LOST',
      priority: 'LOW',
      source: 'COLD_CALL',
      expectedValue: 400000,
      assignedToId: employeeUser.id,
      customer: { name: 'Adv. Sameer Verma', companyName: 'Verma & Associates Legal Firm', phone: '9811001119', email: 'sameer@vermalegal.com', location: 'Chandigarh' },
    },
    {
      title: 'Gym & Spa Membership Cloud System',
      product: 'FitPro Cloud',
      stage: 'LOST',
      priority: 'LOW',
      source: 'WEBSITE',
      expectedValue: 180000,
      assignedToId: employeeUser.id,
      customer: { name: 'Rohit Bal', companyName: 'IronCore Fitness Clubs', phone: '9811001120', email: 'rohit@ironcoregym.in', location: 'Noida' },
    },

    // --- STAGE: ON_HOLD (2) ---
    {
      title: 'University Library RFID Tracking System',
      product: 'RFID Tracking Suite',
      stage: 'ON_HOLD',
      priority: 'MEDIUM',
      source: 'EXHIBITION',
      expectedValue: 550000,
      assignedToId: employeeUser.id,
      customer: { name: 'Dr. Geeta Pillai', companyName: 'Apex Central University', phone: '9811001121', email: 'library@apexuniv.edu', location: 'Bhopal' },
      hasFollowup: true,
    },
    {
      title: 'Smart City Parking Sensor App',
      product: 'SmartPark Infrastructure System',
      stage: 'ON_HOLD',
      priority: 'HIGH',
      source: 'REFERRAL',
      expectedValue: 2400000,
      assignedToId: managerUser.id,
      customer: { name: 'Naveen Jindal', companyName: 'Urban Infra Technologies', phone: '9811001122', email: 'naveen@urbaninfratech.in', location: 'Lucknow' },
    },
  ];

  console.log(`Submitting ${templates.length} enquiries via Admin API...`);
  const createdEnquiries: any[] = [];

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const res = await request(
      '/enquiries',
      {
        method: 'POST',
        body: JSON.stringify({
          phone: t.customer.phone,
          email: t.customer.email,
          companyName: t.customer.companyName,
          location: t.customer.location,
          product: t.product,
          priority: t.priority,
          source: t.source,
          expectedValue: t.expectedValue,
          remarks: `${t.title} - Provisioned via comprehensive test suite.`,
          assignedToId: t.assignedToId || null,
          customer: t.customer,
        }),
      },
      adminToken,
    );

    const enqData = res.data?.data?.enquiry || res.data?.data;
    if (res.ok && enqData?.id) {
      createdEnquiries.push({ ...enqData, spec: t });
    } else {
      console.error(`Failed to create enquiry #${i + 1}:`, res.data);
    }
  }

  assert(`Created ${createdEnquiries.length}/22 enquiries successfully`, createdEnquiries.length === 22);

  // -------------------------------------------------------------
  // 3. Stage Transitions & StatusHistory Append-Only Verification
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing Status Transitions & Append-Only Audit Trail ---');

  let transitionCount = 0;
  for (const enq of createdEnquiries) {
    const targetStage = enq.spec.stage;
    if (targetStage !== 'NEW') {
      const transRes = await request(
        `/enquiries/${enq.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            newStatus: targetStage,
            reason: `Stage progression to ${targetStage} during full test suite execution.`,
          }),
        },
        adminToken,
      );
      if (transRes.ok) transitionCount++;
      else console.error(`Status transition failed for ${enq.id}:`, transRes.data);
    }
  }
  assert(`Successfully progressed ${transitionCount}/19 enquiries to target stages`, transitionCount === 19);

  // Verify StatusHistory on a CONVERTED enquiry
  const wonEnquiry = createdEnquiries.find((e) => e.spec.stage === 'CONVERTED');
  if (wonEnquiry) {
    const detailRes = await request(`/enquiries/${wonEnquiry.id}`, { method: 'GET' }, adminToken);
    const enqDetail = detailRes.data?.data?.enquiry || detailRes.data?.data;
    const history = enqDetail?.statusHistory || [];
    assert('StatusHistory audit records created automatically on transition', history.length >= 2);
  }

  // -------------------------------------------------------------
  // 4. Follow-up Module Testing
  // -------------------------------------------------------------
  console.log('\n--- 4. Testing Follow-up Module (Creation & Completion) ---');

  let createdFollowups = 0;
  let testFollowupId = '';

  for (const enq of createdEnquiries) {
    if (enq.spec.hasFollowup) {
      const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const fRes = await request(
        '/followups',
        {
          method: 'POST',
          body: JSON.stringify({
            enquiryId: enq.id,
            dueAt: dueAt.toISOString(),
            purpose: `Follow-up call with ${enq.spec.customer.name} on ${enq.spec.product}.`,
          }),
        },
        adminToken,
      );

      const fData = fRes.data?.data?.followup || fRes.data?.data;
      if (fRes.ok && fData?.id) {
        createdFollowups++;
        if (!testFollowupId) testFollowupId = fData.id;
      } else {
        console.error('Followup creation error:', fRes.data);
      }
    }
  }
  assert(`Scheduled ${createdFollowups} contextual follow-ups`, createdFollowups >= 7);

  // Complete one follow-up
  if (testFollowupId) {
    const compRes = await request(`/followups/${testFollowupId}/complete`, { method: 'PATCH' }, adminToken);
    assert('Complete Follow-up Endpoint (PATCH /followups/:id/complete)', compRes.ok);
  }

  // -------------------------------------------------------------
  // 5. Quotation Module Testing
  // -------------------------------------------------------------
  console.log('\n--- 5. Testing Quotation Generation & Acceptance Workflow ---');

  let quotesCreated = 0;
  let testQuotationId = '';
  for (const enq of createdEnquiries) {
    if (enq.spec.quotationAmount) {
      const qRes = await request(
        `/enquiries/${enq.id}/quotations`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: enq.spec.quotationAmount,
            notes: `Commercial quote for ${enq.spec.customer.companyName}. Valid for 30 days.`,
          }),
        },
        adminToken,
      );

      const qData = qRes.data?.data;
      if (qRes.ok && qData?.id) {
        quotesCreated++;
        if (!testQuotationId) testQuotationId = qData.id;
      } else {
        console.error('Quotation creation error:', qRes.data);
      }
    }
  }
  assert(`Generated ${quotesCreated} commercial quotations for qualified deals`, quotesCreated >= 7);

  if (testQuotationId) {
    const sentQuote = await request(
      `/quotations/${testQuotationId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'SENT', notes: 'Quotation sent to client for commercial evaluation.' }),
      },
      adminToken,
    );
    assert('Transition Quotation to SENT (PATCH /quotations/:id/status)', sentQuote.ok);

    const transQuote = await request(
      `/quotations/${testQuotationId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACCEPTED', notes: 'Client formally approved commercial terms.' }),
      },
      adminToken,
    );
    assert('Transition Quotation to ACCEPTED (PATCH /quotations/:id/status)', transQuote.ok);
  }

  // -------------------------------------------------------------
  // 6. Enquiry Reassignment & Forwarding Workflow
  // -------------------------------------------------------------
  console.log('\n--- 6. Testing Delegation & Forwarding Workflow ---');

  const enqToReassign = createdEnquiries.find((e) => e.spec.assignedToId === managerUser.id);
  if (enqToReassign) {
    const reassignRes = await request(
      `/enquiries/${enqToReassign.id}/assign`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          assignedToId: employeeUser.id,
        }),
      },
      managerToken,
    );
    assert('Manager delegation of enquiry to Employee (PATCH /enquiries/:id/assign)', reassignRes.ok);
  }

  // -------------------------------------------------------------
  // 7. Activity Audit Trail Verification
  // -------------------------------------------------------------
  console.log('\n--- 7. Testing Activity Logging & History Inspection ---');

  const sampleEnquiry = createdEnquiries[0];
  const remarkRes = await request(
    `/enquiries/${sampleEnquiry.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        remarks: 'Client attended product demonstration and requested commercial SLA sheet.',
      }),
    },
    employeeToken,
  );
  assert('Log Remark / Activity via Enquiry Update (PATCH /enquiries/:id)', remarkRes.ok);

  const detailWithActs = await request(`/enquiries/${sampleEnquiry.id}`, { method: 'GET' }, employeeToken);
  const enqDetails = detailWithActs.data?.data?.enquiry || detailWithActs.data?.data;
  const activities = enqDetails?.activities || [];
  assert('Verify Append-Only Activity Timeline on Enquiry', detailWithActs.ok && activities.length > 0);

  // -------------------------------------------------------------
  // 8. In-App Notifications Verification
  // -------------------------------------------------------------
  console.log('\n--- 8. Testing In-App Notification System ---');

  const notifRes = await request('/notifications', { method: 'GET' }, employeeToken);
  assert('Fetch Employee Notifications (GET /notifications)', notifRes.ok);
  const notifications = notifRes.data?.data?.notifications || notifRes.data?.data || [];
  if (Array.isArray(notifications) && notifications.length > 0) {
    const unreadId = notifications[0].id;
    const markReadRes = await request(`/notifications/${unreadId}/read`, { method: 'PATCH' }, employeeToken);
    assert('Mark Notification as Read (PATCH /notifications/:id/read)', markReadRes.ok);
  }

  // -------------------------------------------------------------
  // 9. Personal & Team Performance Dashboards
  // -------------------------------------------------------------
  console.log('\n--- 9. Testing Personal & Team Dashboards (Metrics & Aggregations) ---');

  const empDash = await request('/dashboard/me', { method: 'GET' }, employeeToken);
  assert('Employee Personal Dashboard Metrics (GET /dashboard/me)', empDash.ok && empDash.data?.data?.countsByStatus !== undefined);

  const teamDash = await request('/dashboard/team', { method: 'GET' }, managerToken);
  assert('Manager Team Dashboard Metrics (GET /dashboard/team)', teamDash.ok && Array.isArray(teamDash.data?.data));

  // -------------------------------------------------------------
  // 10. Global Search & Multi-Filter Querying
  // -------------------------------------------------------------
  console.log('\n--- 10. Testing Global Search & Multi-Filter Queries ---');

  const searchRes = await request('/search?q=Mehta', { method: 'GET' }, adminToken);
  assert('Search by Customer / Company Name ("Mehta")', searchRes.ok && searchRes.data?.data?.length > 0);

  const filterWonRes = await request('/enquiries?status=CONVERTED', { method: 'GET' }, adminToken);
  const wonList = filterWonRes.data?.data?.enquiries || filterWonRes.data?.data || [];
  assert('Filter Enquiries by Pipeline Status (CONVERTED)', filterWonRes.ok && wonList.length >= 3);

  const filterPriorityRes = await request('/enquiries?priority=HIGH', { method: 'GET' }, adminToken);
  const highList = filterPriorityRes.data?.data?.enquiries || filterPriorityRes.data?.data || [];
  assert('Filter Enquiries by Priority (HIGH)', filterPriorityRes.ok && highList.length > 0);

  // -------------------------------------------------------------
  // 11. Super Admin User & Password Management (New Feature)
  // -------------------------------------------------------------
  console.log('\n--- 11. Testing Super Admin Credential Provisioning (PATCH /users/:id/password) ---');

  const testTempPassword = 'TempPassword123#';
  const pwdRes = await request(
    `/users/${employeeUser.id}/password`,
    {
      method: 'PATCH',
      body: JSON.stringify({ newPassword: testTempPassword }),
    },
    adminToken,
  );
  assert('Super Admin updates Employee password (PATCH /users/:id/password)', pwdRes.ok);

  // Verify login with new temporary password
  const testNewLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: employeeUser.email, password: testTempPassword }),
  });
  assert('Employee successfully signs in with newly assigned password', testNewLogin.ok);

  // Restore employee password back to Password123!
  const restoreRes = await request(
    `/users/${employeeUser.id}/password`,
    {
      method: 'PATCH',
      body: JSON.stringify({ newPassword: 'Password123!' }),
    },
    adminToken,
  );
  assert('Restore Employee password back to standard Password123!', restoreRes.ok);

  // -------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  COMPREHENSIVE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution aborted due to unexpected exception:', err);
  process.exit(1);
});
