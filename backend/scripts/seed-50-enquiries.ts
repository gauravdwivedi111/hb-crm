import dotenv from 'dotenv';
import path from 'path';
import argon2 from 'argon2';
import {
  Role,
  EnquiryStatus,
  Priority,
  FollowupStatus,
  FollowupFrequency,
  QuotationStatus,
  ActivityType,
} from '@prisma/client';
import { prisma } from '../src/prisma/client.js';
import { getTimezoneDayBoundaries, getTimezoneMonthBoundaries } from '../src/utils/date.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface SeedEnquirySpec {
  status: EnquiryStatus;
  priority: Priority;
  source: string;
  product: string;
  expectedValue: number;
  remarks?: string;
  assigneeKey: 'admin' | 'rajesh' | 'priya' | 'amit' | 'vikram' | 'sneha' | 'unassigned';
  customer: {
    name: string;
    companyName: string;
    phone: string;
    email: string;
    location: string;
  };
  contactedDaysAgo?: number;
  followup?: {
    type: 'due_today' | 'overdue' | 'future' | 'completed';
    purpose: string;
    frequency?: FollowupFrequency;
  };
  quotation?: {
    status: QuotationStatus;
    amount: number;
    notes?: string;
  };
  attachment?: {
    fileName: string;
    fileType: string;
    fileSize: number;
  };
  conversionMonthsAgo?: number; // 0 = this month, 1 = previous month
}

const ENQUIRY_SPECS: SeedEnquirySpec[] = [
  // --- 1 to 6: NEW (6) ---
  {
    status: 'NEW',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'Enterprise ERP Implementation',
    expectedValue: 2500000,
    remarks: 'Immediate demo requested by CTO.',
    assigneeKey: 'unassigned',
    customer: {
      name: 'Aditya Birla',
      companyName: 'Aditya Birla Chemicals',
      phone: '+919811000101',
      email: 'aditya.birla@abchem.in',
      location: 'Mumbai, Maharashtra',
    },
  },
  {
    status: 'NEW',
    priority: 'HIGH',
    source: 'TRADE_SHOW',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1200000,
    remarks: 'Met at Bangalore Tech Summit 2026.',
    assigneeKey: 'unassigned',
    customer: {
      name: 'Sunita Rao',
      companyName: 'Deccan Aerospace Components',
      phone: '+919811000102',
      email: 'sunita.rao@deccanaero.com',
      location: 'Bengaluru, Karnataka',
    },
  },
  {
    status: 'NEW',
    priority: 'MEDIUM',
    source: 'REFERRAL',
    product: 'Annual Maintenance Contract (AMC)',
    expectedValue: 450000,
    remarks: 'Referred by HDFC FinTech branch head.',
    assigneeKey: 'priya',
    customer: {
      name: 'Rohan Deshmukh',
      companyName: 'Sahyadri Automations Ltd',
      phone: '+919811000103',
      email: 'rohan.d@sahyadriaauto.co.in',
      location: 'Pune, Maharashtra',
    },
  },
  {
    status: 'NEW',
    priority: 'LOW',
    source: 'COLD_CALL',
    product: 'VoIP Call Center Telephony',
    expectedValue: 80000,
    remarks: 'Outbound campaign response.',
    assigneeKey: 'amit',
    customer: {
      name: 'Kavita Nair',
      companyName: 'Malabar Logistics Pvt Ltd',
      phone: '+919811000104',
      email: 'kavita@malabarlogistics.com',
      location: 'Kochi, Kerala',
    },
  },
  {
    status: 'NEW',
    priority: 'HIGH',
    source: 'LINKEDIN',
    product: 'Cybersecurity Audit & Pen-testing',
    expectedValue: 950000,
    remarks: 'Inbound message from Security Lead.',
    assigneeKey: 'sneha',
    customer: {
      name: 'Gaurav Kulkarni',
      companyName: 'FinSecure Payments Hub',
      phone: '+919811000105',
      email: 'gaurav.k@finsecurehub.com',
      location: 'Hyderabad, Telangana',
    },
  },
  {
    status: 'NEW',
    priority: 'MEDIUM',
    source: 'WEBSITE',
    product: 'Custom CRM & Workflow Automation',
    expectedValue: 600000,
    remarks: 'Web form submission for 50 sales agents.',
    assigneeKey: 'rajesh',
    customer: {
      name: 'Meera Iyer',
      companyName: 'Coromandel Real Estate',
      phone: '+919811000106',
      email: 'meera.iyer@coromandelre.com',
      location: 'Chennai, Tamil Nadu',
    },
  },

  // --- 7 to 11: ASSIGNED (5) ---
  {
    status: 'ASSIGNED',
    priority: 'HIGH',
    source: 'DIRECT_INQUIRY',
    product: 'Data Warehouse & BI Reporting',
    expectedValue: 1800000,
    remarks: 'Assigned to Priya for quick response.',
    assigneeKey: 'priya',
    customer: {
      name: 'Harish Mehta',
      companyName: 'Gujarat Precision Castings',
      phone: '+919811000107',
      email: 'harish@gujaratprecision.in',
      location: 'Ahmedabad, Gujarat',
    },
  },
  {
    status: 'ASSIGNED',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Enterprise ERP Implementation',
    expectedValue: 1400000,
    remarks: 'Assigned to Amit Patel.',
    assigneeKey: 'amit',
    customer: {
      name: 'Deepak Chopra',
      companyName: 'Apex Pharma Packaging',
      phone: '+919811000108',
      email: 'deepak.c@apexpharma.com',
      location: 'Vadodara, Gujarat',
    },
  },
  {
    status: 'ASSIGNED',
    priority: 'MEDIUM',
    source: 'WEBSITE',
    product: 'Mobile App Development (iOS & Android)',
    expectedValue: 750000,
    remarks: 'B2B field service tracking app.',
    assigneeKey: 'sneha',
    customer: {
      name: 'Pooja Bhatia',
      companyName: 'SwiftFleet Logistics',
      phone: '+919811000109',
      email: 'pooja@swiftfleet.in',
      location: 'Noida, Uttar Pradesh',
    },
  },
  {
    status: 'ASSIGNED',
    priority: 'LOW',
    source: 'TRADE_SHOW',
    product: 'Annual Maintenance Contract (AMC)',
    expectedValue: 90000,
    remarks: 'Hardware maintenance lead.',
    assigneeKey: 'priya',
    customer: {
      name: 'Naveen Reddy',
      companyName: 'Telangana Agro Tech',
      phone: '+919811000110',
      email: 'naveen@telanganaagro.com',
      location: 'Warangal, Telangana',
    },
  },
  {
    status: 'ASSIGNED',
    priority: 'HIGH',
    source: 'EMAIL_CAMPAIGN',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1100000,
    remarks: 'Legacy datacenter exit initiative.',
    assigneeKey: 'rajesh',
    customer: {
      name: 'Arun Joshi',
      companyName: 'Deccan Forge & Stampings',
      phone: '+919811000111',
      email: 'arun.j@deccanforge.co.in',
      location: 'Pune, Maharashtra',
    },
  },

  // --- 12 to 17: CONTACTED (6) ---
  {
    status: 'CONTACTED',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'AI Customer Service Bot',
    expectedValue: 850000,
    remarks: 'Initial discovery call completed.',
    contactedDaysAgo: 1,
    assigneeKey: 'priya',
    customer: {
      name: 'Shalini Sengupta',
      companyName: 'Bengal Retail Marts',
      phone: '+919811000112',
      email: 'shalini@bengalretail.in',
      location: 'Kolkata, West Bengal',
    },
  },
  {
    status: 'CONTACTED',
    priority: 'MEDIUM',
    source: 'COLD_CALL',
    product: 'Custom CRM & Workflow Automation',
    expectedValue: 500000,
    remarks: 'Spoke with Head of Sales.',
    contactedDaysAgo: 2,
    assigneeKey: 'amit',
    customer: {
      name: 'Manoj Pillai',
      companyName: 'Travancore Rubber Works',
      phone: '+919811000113',
      email: 'manoj.p@travancorerubber.com',
      location: 'Thiruvananthapuram, Kerala',
    },
  },
  {
    status: 'CONTACTED',
    priority: 'HIGH',
    source: 'PARTNER',
    product: 'Cybersecurity Audit & Pen-testing',
    expectedValue: 1600000,
    remarks: 'Urgent compliance audit required.',
    contactedDaysAgo: 0,
    assigneeKey: 'sneha',
    customer: {
      name: 'Alok Trivedi',
      companyName: 'Indus Valley Microfinance',
      phone: '+919811000114',
      email: 'alok.t@indusmicro.org',
      location: 'Indore, Madhya Pradesh',
    },
  },
  {
    status: 'CONTACTED',
    priority: 'MEDIUM',
    source: 'REFERRAL',
    product: 'VoIP Call Center Telephony',
    expectedValue: 350000,
    remarks: 'Shared product brochure & deck.',
    contactedDaysAgo: 3,
    assigneeKey: 'priya',
    customer: {
      name: 'Divya Nambiar',
      companyName: 'Coastal Hospitality Hub',
      phone: '+919811000115',
      email: 'divya@coastalhospitality.com',
      location: 'Mangalore, Karnataka',
    },
  },
  {
    status: 'CONTACTED',
    priority: 'LOW',
    source: 'WEBSITE',
    product: 'Annual Maintenance Contract (AMC)',
    expectedValue: 95000,
    remarks: 'First phone touchpoint completed.',
    contactedDaysAgo: 4,
    assigneeKey: 'amit',
    customer: {
      name: 'Suresh Raina',
      companyName: 'Awadh Agro Supplies',
      phone: '+919811000116',
      email: 'suresh@awadhagro.in',
      location: 'Lucknow, Uttar Pradesh',
    },
  },
  {
    status: 'CONTACTED',
    priority: 'HIGH',
    source: 'LINKEDIN',
    product: 'Data Warehouse & BI Reporting',
    expectedValue: 1300000,
    remarks: 'Data pipeline scope discussion.',
    contactedDaysAgo: 1,
    assigneeKey: 'vikram',
    customer: {
      name: 'Tarun Mathur',
      companyName: 'Jaipur Jewels Online',
      phone: '+919811000117',
      email: 'tarun.m@jaipurjewels.com',
      location: 'Jaipur, Rajasthan',
    },
  },

  // --- 18 to 24: FOLLOW_UP_REQUIRED (7) ---
  // (Contains Due Today, Overdue, and Future)
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'Enterprise ERP Implementation',
    expectedValue: 3200000,
    remarks: 'Client requested architectural review session today.',
    contactedDaysAgo: 2,
    assigneeKey: 'priya',
    followup: {
      type: 'due_today',
      purpose: 'Technical deep-dive with VP Engineering',
      frequency: 'ONE_TIME',
    },
    customer: {
      name: 'Rajnish Oberoi',
      companyName: 'Oberoi Industrial Gears',
      phone: '+919811000118',
      email: 'rajnish@oberoigears.com',
      location: 'Gurugram, Haryana',
    },
  },
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1500000,
    remarks: 'Due today follow-up for AWS architecture signoff.',
    contactedDaysAgo: 3,
    assigneeKey: 'amit',
    followup: {
      type: 'due_today',
      purpose: 'Confirm migration timeline and budget',
      frequency: 'WEEKLY',
    },
    customer: {
      name: 'Bhavna Parekh',
      companyName: 'Kutch Spices Exports',
      phone: '+919811000119',
      email: 'bhavna@kutchspices.com',
      location: 'Kandla, Gujarat',
    },
  },
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'HIGH',
    source: 'INBOUND_PHONE',
    product: 'Cybersecurity Audit & Pen-testing',
    expectedValue: 1100000,
    remarks: 'Due today scheduled review.',
    contactedDaysAgo: 1,
    assigneeKey: 'sneha',
    followup: {
      type: 'due_today',
      purpose: 'Review NDA & security questionnaire',
      frequency: 'ONE_TIME',
    },
    customer: {
      name: 'Farhan Zaidi',
      companyName: 'Crescent Microfinance',
      phone: '+919811000120',
      email: 'farhan@crescentmicro.org',
      location: 'Bhopal, Madhya Pradesh',
    },
  },
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'HIGH',
    source: 'TRADE_SHOW',
    product: 'Industrial IoT Monitoring Solutions',
    expectedValue: 2800000,
    remarks: 'OVERDUE follow-up! Client waiting for factory visit.',
    contactedDaysAgo: 5,
    assigneeKey: 'priya',
    followup: {
      type: 'overdue',
      purpose: 'Factory IoT sensor deployment proposal',
      frequency: 'ONE_TIME',
    },
    customer: {
      name: 'Ashwin Merchant',
      companyName: 'Baroda Steel & Tubes',
      phone: '+919811000121',
      email: 'ashwin.m@barodasteel.in',
      location: 'Vadodara, Gujarat',
    },
  },
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'HIGH',
    source: 'DIRECT_INQUIRY',
    product: 'Custom CRM & Workflow Automation',
    expectedValue: 900000,
    remarks: 'OVERDUE: Sales demo follow-up was missed 3 days ago.',
    contactedDaysAgo: 6,
    assigneeKey: 'amit',
    followup: {
      type: 'overdue',
      purpose: 'Missed demo rescheduling call',
      frequency: 'DAILY',
    },
    customer: {
      name: 'Geeta Subramaniam',
      companyName: 'Madurai Textiles Consortium',
      phone: '+919811000122',
      email: 'geeta@maduraitextiles.com',
      location: 'Madurai, Tamil Nadu',
    },
  },
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'MEDIUM',
    source: 'WEBSITE',
    product: 'Mobile App Development (iOS & Android)',
    expectedValue: 650000,
    remarks: 'Future scheduled catchup next week.',
    contactedDaysAgo: 2,
    assigneeKey: 'sneha',
    followup: {
      type: 'future',
      purpose: 'UI/UX wireframes walkthrough',
      frequency: 'WEEKLY',
    },
    customer: {
      name: 'Kishore Varma',
      companyName: 'Godavari Food Distributors',
      phone: '+919811000123',
      email: 'kishore@godavarifoods.co.in',
      location: 'Vijayawada, Andhra Pradesh',
    },
  },
  {
    status: 'FOLLOW_UP_REQUIRED',
    priority: 'LOW',
    source: 'COLD_CALL',
    product: 'VoIP Call Center Telephony',
    expectedValue: 120000,
    remarks: 'Future check-in scheduled.',
    contactedDaysAgo: 4,
    assigneeKey: 'rajesh',
    followup: {
      type: 'future',
      purpose: 'Quarterly review of telephony requirement',
      frequency: 'MONTHLY',
    },
    customer: {
      name: 'Nitin Gadkari Jr',
      companyName: 'Vidarbha Logistics Park',
      phone: '+919811000124',
      email: 'nitin@vidarbhalogistics.in',
      location: 'Nagpur, Maharashtra',
    },
  },

  // --- 25 to 30: QUOTATION_SENT (6) ---
  {
    status: 'QUOTATION_SENT',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'Enterprise ERP Implementation',
    expectedValue: 3500000,
    remarks: 'Formal proposal sent. Client reviewing.',
    contactedDaysAgo: 2,
    assigneeKey: 'priya',
    quotation: {
      status: 'SENT',
      amount: 3500000,
      notes: 'Includes implementation, training, and 12-month AMC warranty.',
    },
    attachment: {
      fileName: 'ERP_Comprehensive_Proposal_v1.pdf',
      fileType: 'application/pdf',
      fileSize: 2450000,
    },
    customer: {
      name: 'Sunil Mittal',
      companyName: 'Bharti Auto Components',
      phone: '+919811000125',
      email: 'sunil.mittal@bhartiauto.in',
      location: 'Faridabad, Haryana',
    },
  },
  {
    status: 'QUOTATION_SENT',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1800000,
    remarks: 'Proposal viewed by client infrastructure team.',
    contactedDaysAgo: 1,
    assigneeKey: 'amit',
    quotation: {
      status: 'VIEWED',
      amount: 1800000,
      notes: 'Phase 1: DB Migration, Phase 2: ECS Microservices.',
    },
    attachment: {
      fileName: 'AWS_Architecture_Quotation.pdf',
      fileType: 'application/pdf',
      fileSize: 1840000,
    },
    customer: {
      name: 'Pradeep Goel',
      companyName: 'Goel Steel Fabricators',
      phone: '+919811000126',
      email: 'pradeep@goelsteel.com',
      location: 'Ghaziabad, Uttar Pradesh',
    },
  },
  {
    status: 'QUOTATION_SENT',
    priority: 'MEDIUM',
    source: 'LINKEDIN',
    product: 'Cybersecurity Audit & Pen-testing',
    expectedValue: 800000,
    remarks: 'Sent commercial quote yesterday.',
    contactedDaysAgo: 1,
    assigneeKey: 'sneha',
    quotation: {
      status: 'SENT',
      amount: 800000,
      notes: 'Black-box and white-box pen-testing scope.',
    },
    customer: {
      name: 'Meenakshi Sundaram',
      companyName: 'Tamil Nadu FinCorp',
      phone: '+919811000127',
      email: 'meenakshi@tnfincorp.org',
      location: 'Coimbatore, Tamil Nadu',
    },
  },
  {
    status: 'QUOTATION_SENT',
    priority: 'HIGH',
    source: 'PARTNER',
    product: 'Data Warehouse & BI Reporting',
    expectedValue: 1400000,
    remarks: 'Proposal sent with sample dashboard screenshots.',
    contactedDaysAgo: 3,
    assigneeKey: 'priya',
    quotation: {
      status: 'SENT',
      amount: 1400000,
      notes: 'Snowflake + PowerBI pipeline quote.',
    },
    attachment: {
      fileName: 'BI_DataWarehouse_Quote.pdf',
      fileType: 'application/pdf',
      fileSize: 3100000,
    },
    customer: {
      name: 'Vivek Singhal',
      companyName: 'Singhal Chemical Fertilisers',
      phone: '+919811000128',
      email: 'vivek@singhalchem.com',
      location: 'Kanpur, Uttar Pradesh',
    },
  },
  {
    status: 'QUOTATION_SENT',
    priority: 'MEDIUM',
    source: 'WEBSITE',
    product: 'Custom CRM & Workflow Automation',
    expectedValue: 700000,
    remarks: 'Client opened proposal via link.',
    contactedDaysAgo: 2,
    assigneeKey: 'amit',
    quotation: {
      status: 'VIEWED',
      amount: 700000,
      notes: 'CRM customization for wholesale sales reps.',
    },
    customer: {
      name: 'Ananya Roy',
      companyName: 'Bhubaneswar Tea Traders',
      phone: '+919811000129',
      email: 'ananya.roy@bhubaneswartea.com',
      location: 'Bhubaneswar, Odisha',
    },
  },
  {
    status: 'QUOTATION_SENT',
    priority: 'LOW',
    source: 'COLD_CALL',
    product: 'Annual Maintenance Contract (AMC)',
    expectedValue: 110000,
    remarks: 'Draft quotation prepared and sent.',
    contactedDaysAgo: 3,
    assigneeKey: 'vikram',
    quotation: {
      status: 'SENT',
      amount: 110000,
      notes: '24x7 hardware and OS maintenance support.',
    },
    customer: {
      name: 'Mahesh Bapat',
      companyName: 'Konkan Cold Storage',
      phone: '+919811000130',
      email: 'mahesh@konkancold.in',
      location: 'Ratnagiri, Maharashtra',
    },
  },

  // --- 31 to 35: NEGOTIATION (5) ---
  {
    status: 'NEGOTIATION',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'Enterprise ERP Implementation',
    expectedValue: 4200000,
    remarks: 'Negotiating payment milestones and delivery dates.',
    contactedDaysAgo: 1,
    assigneeKey: 'priya',
    quotation: {
      status: 'REVISED',
      amount: 3950000,
      notes: 'Revised 6% discount agreed upon with Director.',
    },
    attachment: {
      fileName: 'Revised_Commercial_Proposal_v2.pdf',
      fileType: 'application/pdf',
      fileSize: 1950000,
    },
    customer: {
      name: 'Vikramaditya Rao',
      companyName: 'Hindustan Heavy Lathes',
      phone: '+919811000131',
      email: 'vikramaditya@hhlindia.com',
      location: 'Hyderabad, Telangana',
    },
  },
  {
    status: 'NEGOTIATION',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1900000,
    remarks: 'Discussion regarding multi-region DR setup.',
    contactedDaysAgo: 2,
    assigneeKey: 'amit',
    quotation: {
      status: 'SENT',
      amount: 1900000,
      notes: 'Includes Mumbai and Hyderabad active-passive setup.',
    },
    customer: {
      name: 'Gita Agarwal',
      companyName: 'Agarwal Packing Industries',
      phone: '+919811000132',
      email: 'gita@agarwalpacking.in',
      location: 'Surat, Gujarat',
    },
  },
  {
    status: 'NEGOTIATION',
    priority: 'MEDIUM',
    source: 'TRADE_SHOW',
    product: 'Mobile App Development (iOS & Android)',
    expectedValue: 950000,
    remarks: 'Negotiating iOS app store submission scope.',
    contactedDaysAgo: 2,
    assigneeKey: 'sneha',
    quotation: {
      status: 'VIEWED',
      amount: 920000,
      notes: 'Hybrid React Native mobile app proposal.',
    },
    customer: {
      name: 'Rameshwar Prasad',
      companyName: 'Patliputra Pharma Dist',
      phone: '+919811000133',
      email: 'rameshwar@patliputrapharma.in',
      location: 'Patna, Bihar',
    },
  },
  {
    status: 'NEGOTIATION',
    priority: 'HIGH',
    source: 'LINKEDIN',
    product: 'Industrial IoT Monitoring Solutions',
    expectedValue: 2100000,
    remarks: 'Finalizing hardware warranty terms.',
    contactedDaysAgo: 1,
    assigneeKey: 'rajesh',
    quotation: {
      status: 'SENT',
      amount: 2050000,
      notes: 'Industrial sensors + edge gateway hardware.',
    },
    attachment: {
      fileName: 'IoT_Specification_BillOfMaterials.pdf',
      fileType: 'application/pdf',
      fileSize: 4200000,
    },
    customer: {
      name: 'Satyajit Ray Jr',
      companyName: 'Howrah Foundry & Forgings',
      phone: '+919811000134',
      email: 'satyajit@howrahfoundry.com',
      location: 'Kolkata, West Bengal',
    },
  },
  {
    status: 'NEGOTIATION',
    priority: 'MEDIUM',
    source: 'PARTNER',
    product: 'AI Customer Service Bot',
    expectedValue: 750000,
    remarks: 'Negotiating multilingual WhatsApp bot modules.',
    contactedDaysAgo: 3,
    assigneeKey: 'priya',
    quotation: {
      status: 'SENT',
      amount: 720000,
      notes: 'Supports Hindi, English, and Marathi NLP.',
    },
    customer: {
      name: 'Hemant Kulkarni',
      companyName: 'Sahyadri Co-op Bank Ltd',
      phone: '+919811000135',
      email: 'hemant.k@sahyadribank.co.in',
      location: 'Satara, Maharashtra',
    },
  },

  // --- 36 to 42: CONVERTED (7) ---
  // (4 this month for conversion rate, 3 previous month)
  {
    status: 'CONVERTED',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'Enterprise ERP Implementation',
    expectedValue: 4800000,
    remarks: 'Deal closed won! Contract signed and PO received.',
    contactedDaysAgo: 2,
    conversionMonthsAgo: 0,
    assigneeKey: 'priya',
    quotation: {
      status: 'ACCEPTED',
      amount: 4800000,
      notes: 'Full signed enterprise contract.',
    },
    attachment: {
      fileName: 'Signed_Master_Service_Agreement.pdf',
      fileType: 'application/pdf',
      fileSize: 3400000,
    },
    customer: {
      name: 'Chandrashekhar Das',
      companyName: 'Kalinga Iron Ore Miners',
      phone: '+919811000136',
      email: 'cs.das@kalingairon.in',
      location: 'Rourkela, Odisha',
    },
  },
  {
    status: 'CONVERTED',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 2200000,
    remarks: 'Deal won! Advance payment received.',
    contactedDaysAgo: 4,
    conversionMonthsAgo: 0,
    assigneeKey: 'amit',
    quotation: {
      status: 'ACCEPTED',
      amount: 2200000,
      notes: 'AWS Well-Architected migration plan.',
    },
    customer: {
      name: 'Preeti Shenoy',
      companyName: 'Mangalore Chemicals Ltd',
      phone: '+919811000137',
      email: 'preeti@mangalorechem.com',
      location: 'Mangalore, Karnataka',
    },
  },
  {
    status: 'CONVERTED',
    priority: 'MEDIUM',
    source: 'TRADE_SHOW',
    product: 'Cybersecurity Audit & Pen-testing',
    expectedValue: 900000,
    remarks: 'Audit contract accepted and kickoff scheduled.',
    contactedDaysAgo: 3,
    conversionMonthsAgo: 0,
    assigneeKey: 'sneha',
    quotation: {
      status: 'ACCEPTED',
      amount: 900000,
      notes: 'RBI and SEBI cybersecurity compliance.',
    },
    customer: {
      name: 'Rajendra Prasad',
      companyName: 'Capital FinTech Services',
      phone: '+919811000138',
      email: 'rajendra@capitalfintech.in',
      location: 'Mumbai, Maharashtra',
    },
  },
  {
    status: 'CONVERTED',
    priority: 'LOW',
    source: 'DIRECT_INQUIRY',
    product: 'Annual Maintenance Contract (AMC)',
    expectedValue: 150000,
    remarks: 'Annual AMC renewed for 2026-2027.',
    contactedDaysAgo: 5,
    conversionMonthsAgo: 0,
    assigneeKey: 'priya',
    quotation: {
      status: 'ACCEPTED',
      amount: 150000,
      notes: '1-year renewed AMC coverage.',
    },
    customer: {
      name: 'Anita Desai',
      companyName: 'Desai Legal Chambers',
      phone: '+919811000139',
      email: 'anita@desailegal.com',
      location: 'New Delhi, Delhi',
    },
  },
  {
    status: 'CONVERTED',
    priority: 'HIGH',
    source: 'EMAIL_CAMPAIGN',
    product: 'Custom CRM & Workflow Automation',
    expectedValue: 1350000,
    remarks: 'Closed deal in previous month.',
    contactedDaysAgo: 45,
    conversionMonthsAgo: 1,
    assigneeKey: 'amit',
    quotation: {
      status: 'ACCEPTED',
      amount: 1350000,
      notes: 'Phase 1 delivered and certified.',
    },
    customer: {
      name: 'Sanjay Dutt',
      companyName: 'Apex Precision Tools',
      phone: '+919811000140',
      email: 'sanjay@apexprecision.co.in',
      location: 'Jamshedpur, Jharkhand',
    },
  },
  {
    status: 'CONVERTED',
    priority: 'MEDIUM',
    source: 'WEBSITE',
    product: 'Data Warehouse & BI Reporting',
    expectedValue: 1100000,
    remarks: 'Historical closed won.',
    contactedDaysAgo: 50,
    conversionMonthsAgo: 1,
    assigneeKey: 'sneha',
    quotation: {
      status: 'ACCEPTED',
      amount: 1100000,
      notes: 'Executive dashboards delivered.',
    },
    customer: {
      name: 'Vinod Khosla',
      companyName: 'Khosla Solar Farms',
      phone: '+919811000141',
      email: 'vinod@khoslasolar.in',
      location: 'Jodhpur, Rajasthan',
    },
  },
  {
    status: 'CONVERTED',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Industrial IoT Monitoring Solutions',
    expectedValue: 3100000,
    remarks: 'Major industrial automation deal closed last month.',
    contactedDaysAgo: 60,
    conversionMonthsAgo: 1,
    assigneeKey: 'rajesh',
    quotation: {
      status: 'ACCEPTED',
      amount: 3100000,
      notes: 'Full turnkey IoT contract.',
    },
    customer: {
      name: 'Govind Swaminathan',
      companyName: 'Tirupur Garments MegaCorp',
      phone: '+919811000142',
      email: 'govind@tirupurgarments.com',
      location: 'Tirupur, Tamil Nadu',
    },
  },

  // --- 43 to 47: LOST (5) ---
  {
    status: 'LOST',
    priority: 'HIGH',
    source: 'COLD_CALL',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1700000,
    remarks: 'Client cancelled budget due to quarterly revenue dip.',
    contactedDaysAgo: 6,
    conversionMonthsAgo: 0,
    assigneeKey: 'priya',
    quotation: {
      status: 'REJECTED',
      amount: 1700000,
      notes: 'Client rejected due to enterprise budget freeze.',
    },
    customer: {
      name: 'Nikhil Kamath',
      companyName: 'Zest Financial Traders',
      phone: '+919811000143',
      email: 'nikhil@zesttraders.in',
      location: 'Bengaluru, Karnataka',
    },
  },
  {
    status: 'LOST',
    priority: 'MEDIUM',
    source: 'WEBSITE',
    product: 'Mobile App Development (iOS & Android)',
    expectedValue: 800000,
    remarks: 'Selected cheaper competitor agency in Indore.',
    contactedDaysAgo: 8,
    conversionMonthsAgo: 0,
    assigneeKey: 'amit',
    quotation: {
      status: 'REJECTED',
      amount: 800000,
      notes: 'Competitor undercut price by 30%.',
    },
    customer: {
      name: 'Ritu Vashishta',
      companyName: 'Malwa Edutech Ventures',
      phone: '+919811000144',
      email: 'ritu@malwaedu.com',
      location: 'Indore, Madhya Pradesh',
    },
  },
  {
    status: 'LOST',
    priority: 'LOW',
    source: 'TRADE_SHOW',
    product: 'VoIP Call Center Telephony',
    expectedValue: 70000,
    remarks: 'Client opted for free open-source Asterisk.',
    contactedDaysAgo: 10,
    conversionMonthsAgo: 0,
    assigneeKey: 'sneha',
    customer: {
      name: 'Karthik Raja',
      companyName: 'Thanjavur Art & Crafts',
      phone: '+919811000145',
      email: 'karthik@thanjavurcrafts.org',
      location: 'Thanjavur, Tamil Nadu',
    },
  },
  {
    status: 'LOST',
    priority: 'HIGH',
    source: 'REFERRAL',
    product: 'Enterprise ERP Implementation',
    expectedValue: 2400000,
    remarks: 'Lost in previous quarter.',
    contactedDaysAgo: 40,
    conversionMonthsAgo: 1,
    assigneeKey: 'amit',
    quotation: {
      status: 'EXPIRED',
      amount: 2400000,
      notes: 'Quotation expired after 60-day validity window.',
    },
    customer: {
      name: 'Brijesh Pandey',
      companyName: 'Varanasi Weavers Apex',
      phone: '+919811000146',
      email: 'brijesh@varanasiweavers.in',
      location: 'Varanasi, Uttar Pradesh',
    },
  },
  {
    status: 'LOST',
    priority: 'MEDIUM',
    source: 'LINKEDIN',
    product: 'AI Customer Service Bot',
    expectedValue: 600000,
    remarks: 'Lost in previous quarter.',
    contactedDaysAgo: 45,
    conversionMonthsAgo: 1,
    assigneeKey: 'priya',
    customer: {
      name: 'Leela Samson',
      companyName: 'Kalakshetra Classical Tours',
      phone: '+919811000147',
      email: 'leela@kalaksheratours.com',
      location: 'Chennai, Tamil Nadu',
    },
  },

  // --- 48 to 50: ON_HOLD (3) ---
  {
    status: 'ON_HOLD',
    priority: 'HIGH',
    source: 'WEBSITE',
    product: 'Enterprise ERP Implementation',
    expectedValue: 5000000,
    remarks: 'Board postponed decision till next fiscal year (April 2026).',
    contactedDaysAgo: 4,
    assigneeKey: 'priya',
    quotation: {
      status: 'CREATED',
      amount: 5000000,
      notes: 'Draft proposal prepared for upcoming board meeting.',
    },
    attachment: {
      fileName: 'Enterprise_ERP_Draft_Scope.pdf',
      fileType: 'application/pdf',
      fileSize: 2800000,
    },
    customer: {
      name: 'Ratan Tata Trust Rep',
      companyName: 'Mithapur Salt & Marine',
      phone: '+919811000148',
      email: 'contact@mithapursalt.com',
      location: 'Dwarka, Gujarat',
    },
  },
  {
    status: 'ON_HOLD',
    priority: 'MEDIUM',
    source: 'REFERRAL',
    product: 'Cloud Migration & AWS Infrastructure',
    expectedValue: 1250000,
    remarks: 'Paused pending internal network security review.',
    contactedDaysAgo: 5,
    assigneeKey: 'amit',
    customer: {
      name: 'Sushil Kumar',
      companyName: 'Haryana Agro coldchain',
      phone: '+919811000149',
      email: 'sushil@haryanaagro.in',
      location: 'Ambala, Haryana',
    },
  },
  {
    status: 'ON_HOLD',
    priority: 'HIGH',
    source: 'DIRECT_INQUIRY',
    product: 'Custom CRM & Workflow Automation',
    expectedValue: 1600000,
    remarks: 'On hold while company completes merger.',
    contactedDaysAgo: 3,
    assigneeKey: 'sneha',
    customer: {
      name: 'Pallavi Joshi',
      companyName: 'Deccan Biotech Solutions',
      phone: '+919811000150',
      email: 'pallavi@deccanbiotech.co.in',
      location: 'Pune, Maharashtra',
    },
  },
];

async function seed() {
  console.log('\n===========================================================');
  console.log('    SEEDING 50 COMPREHENSIVE CRM TEST ENQUIRIES');
  console.log('===========================================================');

  const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });
  const adminPasswordHash = await argon2.hash('AdminPassword123!', { type: argon2.argon2id });

  // 1. Ensure supervisory hierarchy
  console.log('1. Setting up organizational users (Admin, Managers, Employees)...');

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@hbcrm.local' },
    update: { isActive: true, passwordHash: adminPasswordHash },
    create: {
      name: 'Super Admin',
      email: 'admin@hbcrm.local',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // Manager 1 (Rajesh Verma)
  const rajesh = await prisma.user.upsert({
    where: { email: 'rajesh.verma@hbcrm.local' },
    update: { isActive: true, supervisorId: admin.id, passwordHash },
    create: {
      name: 'Rajesh Verma',
      email: 'rajesh.verma@hbcrm.local',
      passwordHash,
      role: Role.MANAGER,
      supervisorId: admin.id,
      isActive: true,
    },
  });

  // Employee 1A (Priya Sharma under Rajesh)
  const priya = await prisma.user.upsert({
    where: { email: 'priya.sharma@hbcrm.local' },
    update: { isActive: true, supervisorId: rajesh.id, passwordHash },
    create: {
      name: 'Priya Sharma',
      email: 'priya.sharma@hbcrm.local',
      passwordHash,
      role: Role.EMPLOYEE,
      supervisorId: rajesh.id,
      isActive: true,
    },
  });

  // Employee 1B (Amit Patel under Rajesh)
  const amit = await prisma.user.upsert({
    where: { email: 'amit.patel@hbcrm.local' },
    update: { isActive: true, supervisorId: rajesh.id, passwordHash },
    create: {
      name: 'Amit Patel',
      email: 'amit.patel@hbcrm.local',
      passwordHash,
      role: Role.EMPLOYEE,
      supervisorId: rajesh.id,
      isActive: true,
    },
  });

  // Manager 2 (Vikram Singh)
  const vikram = await prisma.user.upsert({
    where: { email: 'vikram.singh@hbcrm.local' },
    update: { isActive: true, supervisorId: admin.id, passwordHash },
    create: {
      name: 'Vikram Singh',
      email: 'vikram.singh@hbcrm.local',
      passwordHash,
      role: Role.MANAGER,
      supervisorId: admin.id,
      isActive: true,
    },
  });

  // Employee 2 (Sneha Reddy under Vikram)
  const sneha = await prisma.user.upsert({
    where: { email: 'sneha.reddy@hbcrm.local' },
    update: { isActive: true, supervisorId: vikram.id, passwordHash },
    create: {
      name: 'Sneha Reddy',
      email: 'sneha.reddy@hbcrm.local',
      passwordHash,
      role: Role.EMPLOYEE,
      supervisorId: vikram.id,
      isActive: true,
    },
  });

  const userMap: Record<string, string | null> = {
    admin: admin.id,
    rajesh: rajesh.id,
    priya: priya.id,
    amit: amit.id,
    vikram: vikram.id,
    sneha: sneha.id,
    unassigned: null,
  };

  const now = new Date();
  const { startOfDay } = getTimezoneDayBoundaries(now);
  const { startOfMonth } = getTimezoneMonthBoundaries(now);

  console.log(`2. Seeding ${ENQUIRY_SPECS.length} enquiries with features...`);

  let count = 0;
  for (const spec of ENQUIRY_SPECS) {
    count++;
    const assigneeId = userMap[spec.assigneeKey];
    const creatorId = admin.id;

    // 2.1 Find or create Customer by phone
    let customer = await prisma.customer.findFirst({
      where: { phone: spec.customer.phone },
    });

    if (customer) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: spec.customer.name,
          companyName: spec.customer.companyName,
          email: spec.customer.email,
          location: spec.customer.location,
          assignedToId: assigneeId,
        },
      });
    } else {
      customer = await prisma.customer.create({
        data: {
          name: spec.customer.name,
          companyName: spec.customer.companyName,
          phone: spec.customer.phone,
          email: spec.customer.email,
          location: spec.customer.location,
          assignedToId: assigneeId,
        },
      });
    }

    // Determine dates
    let createdAtDate = new Date(now.getTime() - (count * 4 + 1) * 3600 * 1000);
    let updatedAtDate = new Date();

    if (spec.conversionMonthsAgo === 1) {
      // Set to previous month
      createdAtDate = new Date(startOfMonth.getTime() - 40 * 24 * 3600 * 1000);
      updatedAtDate = new Date(startOfMonth.getTime() - 20 * 24 * 3600 * 1000);
    } else if (spec.conversionMonthsAgo === 0) {
      // Set to current month
      updatedAtDate = new Date();
    }

    const lastContactedDate =
      spec.contactedDaysAgo !== undefined
        ? new Date(now.getTime() - spec.contactedDaysAgo * 24 * 3600 * 1000)
        : null;

    // Check if enquiry already seeded for this phone
    let enquiry = await prisma.enquiry.findFirst({
      where: {
        customerId: customer.id,
        product: spec.product,
      },
    });

    if (enquiry) {
      enquiry = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          status: spec.status,
          priority: spec.priority,
          source: spec.source,
          expectedValue: spec.expectedValue,
          remarks: spec.remarks,
          ...(assigneeId ? { assignedTo: { connect: { id: assigneeId } } } : { assignedTo: { disconnect: true } }),
          lastContactedAt: lastContactedDate,
          updatedAt: updatedAtDate,
        },
      });
    } else {
      enquiry = await prisma.enquiry.create({
        data: {
          customer: { connect: { id: customer.id } },
          createdBy: { connect: { id: creatorId } },
          phone: customer.phone,
          email: customer.email,
          companyName: customer.companyName,
          location: customer.location,
          source: spec.source,
          product: spec.product,
          status: spec.status,
          priority: spec.priority,
          expectedValue: spec.expectedValue,
          remarks: spec.remarks,
          ...(assigneeId ? { assignedTo: { connect: { id: assigneeId } } } : {}),
          lastContactedAt: lastContactedDate,
          createdAt: createdAtDate,
          updatedAt: updatedAtDate,
        },
      });
    }

    // 2.2 Follow-up attached
    if (spec.followup && assigneeId) {
      let dueAtDate: Date;
      let fStatus: FollowupStatus = FollowupStatus.PENDING;
      let completedAtDate: Date | null = null;

      if (spec.followup.type === 'due_today') {
        // Between startOfDay and endOfDay in IST (e.g. today at 3:00 PM)
        dueAtDate = new Date(startOfDay.getTime() + 15 * 3600 * 1000);
      } else if (spec.followup.type === 'overdue') {
        // 2 days ago, status OVERDUE or PENDING past due
        dueAtDate = new Date(now.getTime() - 48 * 3600 * 1000);
        fStatus = FollowupStatus.OVERDUE;
      } else if (spec.followup.type === 'future') {
        // 4 days in future
        dueAtDate = new Date(now.getTime() + 96 * 3600 * 1000);
      } else {
        // Completed
        dueAtDate = new Date(now.getTime() - 24 * 3600 * 1000);
        fStatus = FollowupStatus.COMPLETED;
        completedAtDate = new Date(now.getTime() - 20 * 3600 * 1000);
      }

      await prisma.followup.create({
        data: {
          enquiry: { connect: { id: enquiry.id } },
          customer: { connect: { id: customer.id } },
          assignedTo: { connect: { id: assigneeId } },
          dueAt: dueAtDate,
          status: fStatus,
          purpose: spec.followup.purpose,
          frequency: spec.followup.frequency || FollowupFrequency.ONE_TIME,
          completedAt: completedAtDate,
        },
      });

      // Update nextFollowupAt on enquiry
      if (fStatus !== FollowupStatus.COMPLETED) {
        await prisma.enquiry.update({
          where: { id: enquiry.id },
          data: { nextFollowupAt: dueAtDate },
        });
      }
    }

    // 2.3 Quotation attached
    if (spec.quotation && assigneeId) {
      let sentAtDate: Date | null = null;
      let respondedAtDate: Date | null = null;

      if (spec.quotation.status === 'SENT' || spec.quotation.status === 'VIEWED') {
        sentAtDate = new Date(now.getTime() - 24 * 3600 * 1000);
      } else if (spec.quotation.status === 'ACCEPTED' || spec.quotation.status === 'REJECTED') {
        sentAtDate = new Date(now.getTime() - 72 * 3600 * 1000);
        respondedAtDate = new Date(now.getTime() - 12 * 3600 * 1000);
      }

      await prisma.quotation.create({
        data: {
          enquiry: { connect: { id: enquiry.id } },
          createdBy: { connect: { id: assigneeId } },
          amount: spec.quotation.amount,
          status: spec.quotation.status,
          notes: spec.quotation.notes,
          sentAt: sentAtDate,
          respondedAt: respondedAtDate,
        },
      });
    }

    // 2.4 Attachment attached
    if (spec.attachment && assigneeId) {
      await prisma.attachment.create({
        data: {
          enquiry: { connect: { id: enquiry.id } },
          customer: { connect: { id: customer.id } },
          uploadedBy: { connect: { id: assigneeId } },
          fileKey: `attachments/enquiries/${enquiry.id}/${Date.now()}_${spec.attachment.fileName}`,
          fileName: spec.attachment.fileName,
          fileType: spec.attachment.fileType,
          fileSize: spec.attachment.fileSize,
        },
      });
    }

    // 2.5 Activity Timeline & Status History
    await prisma.activity.create({
      data: {
        enquiry: { connect: { id: enquiry.id } },
        user: { connect: { id: assigneeId || admin.id } },
        type: ActivityType.REMARK_ADDED,
        description: `Enquiry for ${spec.product} registered from ${spec.source}.`,
        newStatus: 'NEW',
      },
    });

    if (spec.status !== 'NEW') {
      await prisma.activity.create({
        data: {
          enquiry: { connect: { id: enquiry.id } },
          user: { connect: { id: assigneeId || admin.id } },
          type: ActivityType.STATUS_CHANGED,
          previousStatus: 'NEW',
          newStatus: spec.status,
          description: `Lifecycle status progressed to ${spec.status}.`,
        },
      });

      await prisma.statusHistory.create({
        data: {
          enquiry: { connect: { id: enquiry.id } },
          changedBy: { connect: { id: assigneeId || admin.id } },
          oldStatus: 'NEW',
          newStatus: spec.status,
          reason: spec.remarks || `Status transitioned to ${spec.status}`,
        },
      });
    }
  }

  console.log(`\n✅ Successfully seeded 50 comprehensive enquiries!`);
  console.log('-----------------------------------------------------------');
  console.log('Login Credentials for testing:');
  console.log('  👑 Admin:    admin@hbcrm.local        / AdminPassword123!');
  console.log('  👔 Manager:  rajesh.verma@hbcrm.local / Password123!');
  console.log('  👩 Rep 1:    priya.sharma@hbcrm.local / Password123!');
  console.log('  👨 Rep 2:    amit.patel@hbcrm.local   / Password123!');
  console.log('  👔 Mgr 2:    vikram.singh@hbcrm.local / Password123!');
  console.log('  👩 Rep 3:    sneha.reddy@hbcrm.local  / Password123!');
  console.log('===========================================================\n');
}

seed()
  .catch((e) => {
    console.error('Fatal seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
