import { Prisma, EnquiryStatus, Priority } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { buildEnquiryAccessFilter, canAccessEnquiry } from './enquiry.access.js';
import { sanitizeCsvField } from '../utils/csv.parser.js';
import { NotFoundError } from '../utils/errors.js';

export interface ExportEnquiriesQuery {
  status?: EnquiryStatus;
  priority?: Priority;
  assignedToId?: string;
  customerId?: string;
  search?: string;
}

/**
 * Escapes a cell according to RFC 4180 and sanitizes against formula injection.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let str = String(value);
  const sanitized = sanitizeCsvField(str);
  str = sanitized !== null ? sanitized : '';
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Converts an array of cell values to a CSV line.
 */
function rowToCsv(row: unknown[]): string {
  return row.map(escapeCsvCell).join(',');
}

export class ExportService {
  /**
   * Generates a complete CSV export of enquiries scoped by the user's role and active filters.
   */
  public async exportEnquiriesCsv(
    user: AuthUserPayload,
    query: ExportEnquiriesQuery = {},
  ): Promise<{ filename: string; csv: string; count: number }> {
    const accessFilter = await buildEnquiryAccessFilter(user, query.assignedToId);
    const conditions: Prisma.EnquiryWhereInput[] = [accessFilter];

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.priority) {
      conditions.push({ priority: query.priority });
    }

    if (query.customerId && query.customerId.trim() !== '') {
      conditions.push({ customerId: query.customerId.trim() });
    }

    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      conditions.push({
        OR: [
          { companyName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { product: { contains: term, mode: 'insensitive' } },
          { customer: { name: { contains: term, mode: 'insensitive' } } },
          { customer: { phone: { contains: term, mode: 'insensitive' } } },
          { customer: { email: { contains: term, mode: 'insensitive' } } },
          { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.EnquiryWhereInput = { AND: conditions };

    const enquiries = await prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        quotations: {
          select: { id: true, amount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        followups: {
          select: { id: true, status: true, dueAt: true },
        },
      },
    });

    const headers = [
      'Enquiry ID',
      'Customer Name',
      'Company Name',
      'Phone Number',
      'Email Address',
      'Location',
      'Product / Requirement',
      'Pipeline Stage',
      'Priority',
      'Lead Source',
      'Expected Deal Value (INR)',
      'Assigned Representative',
      'Assigned Rep Email',
      'Created By',
      'Created Date',
      'Last Contacted Date',
      'Latest Remarks',
      'Total Follow-ups',
      'Pending Follow-ups',
      'Total Quotations',
      'Latest Quotation Status',
      'Total Quotations Value (INR)',
    ];

    const rows: string[] = [];
    // Prepend UTF-8 BOM so Excel opens with proper character encoding
    rows.push('\uFEFF' + rowToCsv(headers));

    for (const enq of enquiries) {
      const customerName = enq.customer?.name || '';
      const company = enq.companyName || enq.customer?.companyName || '';
      const phone = enq.phone || enq.customer?.phone || '';
      const email = enq.email || enq.customer?.email || '';
      const location = enq.location || enq.customer?.location || '';
      const product = enq.product || '';
      const stage = enq.status;
      const priority = enq.priority;
      const source = enq.source || '';
      const expectedVal = enq.expectedValue ? Number(enq.expectedValue).toFixed(2) : '0.00';
      const repName = enq.assignedTo?.name || 'Unassigned';
      const repEmail = enq.assignedTo?.email || '';
      const createdBy = enq.createdBy?.name || '';
      const createdDate = enq.createdAt ? new Date(enq.createdAt).toISOString() : '';
      const lastContacted = enq.lastContactedAt ? new Date(enq.lastContactedAt).toISOString() : '';
      const remarks = enq.remarks || '';

      const totalFollowups = enq.followups.length;
      const pendingFollowups = enq.followups.filter((f) => f.status === 'PENDING').length;
      const totalQuotations = enq.quotations.length;
      const latestQuotationStatus = enq.quotations[0]?.status || 'N/A';
      const totalQuotationAmount = enq.quotations
        .reduce((sum, q) => sum + (q.amount ? Number(q.amount) : 0), 0)
        .toFixed(2);

      rows.push(
        rowToCsv([
          enq.id,
          customerName,
          company,
          phone,
          email,
          location,
          product,
          stage,
          priority,
          source,
          expectedVal,
          repName,
          repEmail,
          createdBy,
          createdDate,
          lastContacted,
          remarks,
          totalFollowups,
          pendingFollowups,
          totalQuotations,
          latestQuotationStatus,
          totalQuotationAmount,
        ]),
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `hb-crm-enquiries-export-${todayStr}.csv`;

    return {
      filename,
      csv: rows.join('\r\n'),
      count: enquiries.length,
    };
  }

  /**
   * Generates a multi-section structured dossier CSV for a single complete enquiry.
   */
  public async exportSingleEnquiryDossierCsv(
    user: AuthUserPayload,
    enquiryId: string,
  ): Promise<{ filename: string; csv: string }> {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    const enquiry = await prisma.enquiry.findUnique({
      where: { id: enquiryId },
      include: {
        customer: true,
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        followups: {
          orderBy: { dueAt: 'asc' },
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
        quotations: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: { select: { id: true, name: true, email: true } },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!enquiry) {
      throw new NotFoundError('Enquiry not found');
    }

    const lines: string[] = [];
    const pushSection = (title: string) => {
      lines.push('');
      lines.push(rowToCsv([`=== ${title.toUpperCase()} ===`]));
    };

    // Header with UTF-8 BOM
    lines.push('\uFEFF' + rowToCsv(['HB CRM - COMPLETE ENQUIRY DOSSIER']));
    lines.push(rowToCsv(['Generated At', new Date().toISOString()]));
    lines.push(rowToCsv(['Enquiry Reference ID', enquiry.id]));

    // SECTION 1: CUSTOMER & ACCOUNT DETAILS
    pushSection('1. Customer & Account Details');
    lines.push(rowToCsv(['Customer Name', enquiry.customer?.name || '']));
    lines.push(rowToCsv(['Company Name', enquiry.companyName || enquiry.customer?.companyName || '']));
    lines.push(rowToCsv(['Direct Phone', enquiry.phone || enquiry.customer?.phone || '']));
    lines.push(rowToCsv(['Email Address', enquiry.email || enquiry.customer?.email || '']));
    lines.push(rowToCsv(['Location / City', enquiry.location || enquiry.customer?.location || '']));

    // SECTION 2: COMMERCIAL PIPELINE OVERVIEW
    pushSection('2. Commercial Pipeline Overview');
    lines.push(rowToCsv(['Product / Requirement', enquiry.product || '']));
    lines.push(rowToCsv(['Pipeline Stage', enquiry.status]));
    lines.push(rowToCsv(['Priority', enquiry.priority]));
    lines.push(rowToCsv(['Lead Source', enquiry.source || '']));
    lines.push(rowToCsv(['Expected Deal Value (INR)', enquiry.expectedValue ? Number(enquiry.expectedValue).toFixed(2) : '0.00']));
    lines.push(rowToCsv(['Assigned Sales Rep', enquiry.assignedTo?.name || 'Unassigned']));
    lines.push(rowToCsv(['Sales Rep Email', enquiry.assignedTo?.email || '']));
    lines.push(rowToCsv(['Created By', enquiry.createdBy?.name || '']));
    lines.push(rowToCsv(['Created Date', enquiry.createdAt ? new Date(enquiry.createdAt).toISOString() : '']));
    lines.push(rowToCsv(['Last Contacted Date', enquiry.lastContactedAt ? new Date(enquiry.lastContactedAt).toISOString() : '']));
    lines.push(rowToCsv(['Latest Remarks', enquiry.remarks || '']));

    // SECTION 3: STATUS TRANSITION AUDIT TRAIL
    pushSection('3. Pipeline Stage Transition History');
    lines.push(rowToCsv(['Date / Time', 'Previous Stage', 'New Stage', 'Changed By', 'Audit Reason']));
    if (enquiry.statusHistory.length === 0) {
      lines.push(rowToCsv(['No status history recorded']));
    } else {
      for (const h of enquiry.statusHistory) {
        lines.push(
          rowToCsv([
            h.createdAt ? new Date(h.createdAt).toISOString() : '',
            h.oldStatus || 'NONE (Initial Creation)',
            h.newStatus,
            h.changedBy?.name || 'System',
            h.reason || '',
          ]),
        );
      }
    }

    // SECTION 4: COMMERCIAL QUOTATIONS
    pushSection('4. Commercial Quotations & Proposals');
    lines.push(rowToCsv(['Quotation ID', 'Status', 'Amount (INR)', 'Created By', 'Sent Date', 'Responded Date', 'Notes / Terms']));
    if (enquiry.quotations.length === 0) {
      lines.push(rowToCsv(['No quotations generated']));
    } else {
      for (const q of enquiry.quotations) {
        lines.push(
          rowToCsv([
            q.id,
            q.status,
            q.amount ? Number(q.amount).toFixed(2) : '0.00',
            q.createdBy?.name || '',
            q.sentAt ? new Date(q.sentAt).toISOString() : 'Not Sent',
            q.respondedAt ? new Date(q.respondedAt).toISOString() : 'Pending',
            q.notes || '',
          ]),
        );
      }
    }

    // SECTION 5: FOLLOW-UP SCHEDULE & TASKS
    pushSection('5. Scheduled & Completed Follow-ups');
    lines.push(rowToCsv(['Follow-up ID', 'Due Date', 'Status', 'Frequency', 'Assigned To', 'Completed Date', 'Purpose / Objective']));
    if (enquiry.followups.length === 0) {
      lines.push(rowToCsv(['No follow-ups recorded']));
    } else {
      for (const f of enquiry.followups) {
        lines.push(
          rowToCsv([
            f.id,
            f.dueAt ? new Date(f.dueAt).toISOString() : '',
            f.status,
            f.frequency,
            f.assignedTo?.name || '',
            f.completedAt ? new Date(f.completedAt).toISOString() : 'Pending',
            f.purpose,
          ]),
        );
      }
    }

    // SECTION 6: ACTIVITY TIMELINE & REMARKS
    pushSection('6. Full Activity & Audit Timeline');
    lines.push(rowToCsv(['Date / Time', 'Activity Type', 'Performed By', 'Description / Details']));
    if (enquiry.activities.length === 0) {
      lines.push(rowToCsv(['No activities recorded']));
    } else {
      for (const a of enquiry.activities) {
        lines.push(
          rowToCsv([
            a.createdAt ? new Date(a.createdAt).toISOString() : '',
            a.type,
            a.user?.name || 'System',
            a.description || '',
          ]),
        );
      }
    }

    const safeName = (enquiry.customer?.name || enquiry.companyName || 'lead')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    const filename = `enquiry-${enquiry.id.slice(-6)}-${safeName}.csv`;

    return {
      filename,
      csv: lines.join('\r\n'),
    };
  }
}

export const exportService = new ExportService();
