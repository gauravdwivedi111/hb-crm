import {
  Prisma,
  QuotationStatus,
  ActivityType,
  EnquiryStatus,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { canAccessEnquiry, buildEnquiryAccessFilter } from './enquiry.access.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../utils/errors.js';

export interface QuotationLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount?: number;
}

export interface CreateQuotationInput {
  enquiryId?: string;
  enquiryCode?: string;
  items?: QuotationLineItem[];
  subtotal?: number | string | Prisma.Decimal | null;
  taxAmount?: number | string | Prisma.Decimal | null;
  totalAmount?: number | string | Prisma.Decimal | null;
  amount?: number | string | Prisma.Decimal | null;
  terms?: string | null;
  notes?: string | null;
  validUntil?: string | Date | null;
  customerName?: string | null;
  customerPhone?: string | null;
  companyName?: string | null;
}

export interface TransitionQuotationStatusInput {
  status: QuotationStatus;
  notes?: string | null;
}

export interface ListQuotationsQuery {
  page?: number;
  limit?: number;
  status?: QuotationStatus;
  search?: string;
  enquiryId?: string;
}

// State transition table
const LEGAL_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  [QuotationStatus.CREATED]: [QuotationStatus.SENT],
  [QuotationStatus.SENT]: [
    QuotationStatus.VIEWED,
    QuotationStatus.ACCEPTED,
    QuotationStatus.REJECTED,
    QuotationStatus.EXPIRED,
    QuotationStatus.REVISED,
  ],
  [QuotationStatus.VIEWED]: [
    QuotationStatus.ACCEPTED,
    QuotationStatus.REJECTED,
    QuotationStatus.EXPIRED,
    QuotationStatus.REVISED,
  ],
  [QuotationStatus.REVISED]: [QuotationStatus.SENT],
  [QuotationStatus.ACCEPTED]: [],
  [QuotationStatus.REJECTED]: [],
  [QuotationStatus.EXPIRED]: [],
};

export class QuotationService {
  /**
   * List all quotations scoped by user access with pagination and filters.
   */
  public async listAllQuotations(user: AuthUserPayload, query: ListQuotationsQuery = {}) {
    const accessFilter = await buildEnquiryAccessFilter(user);

    const conditions: Prisma.QuotationWhereInput[] = [
      { enquiry: accessFilter },
    ];

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.enquiryId) {
      conditions.push({ enquiryId: query.enquiryId });
    }

    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      conditions.push({
        OR: [
          { quotationNumber: { contains: term, mode: 'insensitive' } },
          { customerName: { contains: term, mode: 'insensitive' } },
          { companyName: { contains: term, mode: 'insensitive' } },
          { customerPhone: { contains: term, mode: 'insensitive' } },
          { enquiry: { enquiryCode: { contains: term, mode: 'insensitive' } } },
          { enquiry: { companyName: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.QuotationWhereInput = { AND: conditions };
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, quotations] = await Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true, phone: true },
          },
          enquiry: {
            select: {
              id: true,
              enquiryCode: true,
              companyName: true,
              phone: true,
              email: true,
              status: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  companyName: true,
                  phone: true,
                  email: true,
                  location: true,
                  gstNumber: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      quotations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Creates a quotation for an enquiry with status CREATED.
   * Auto-generates unique sequential quotationNumber (e.g. QT-1029).
   */
  public async createQuotation(
    user: AuthUserPayload,
    enquiryIdentifier: string,
    input: CreateQuotationInput,
  ) {
    // Resolve enquiry by ID or enquiryCode
    let targetEnquiry = await prisma.enquiry.findFirst({
      where: {
        OR: [
          { id: enquiryIdentifier },
          { enquiryCode: enquiryIdentifier.trim().toUpperCase() },
        ],
      },
      include: { customer: true },
    });

    if (!targetEnquiry && input.enquiryCode) {
      targetEnquiry = await prisma.enquiry.findUnique({
        where: { enquiryCode: input.enquiryCode.trim().toUpperCase() },
        include: { customer: true },
      });
    }

    if (!targetEnquiry) {
      throw new NotFoundError('Target enquiry not found.');
    }

    const hasAccess = await canAccessEnquiry(user, targetEnquiry.id);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this enquiry.');
    }

    // Generate next sequential quotationNumber (e.g. QT-1029)
    const allQuotes = await prisma.quotation.findMany({
      where: { quotationNumber: { not: null } },
      select: { quotationNumber: true },
    });
    let maxNum = 1000;
    for (const item of allQuotes) {
      const match = item.quotationNumber ? item.quotationNumber.match(/QT-(\d+)/) : null;
      if (match && match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    const nextQuotationNumber = `QT-${maxNum + 1}`;

    // Calculate line item totals if provided
    let calculatedSubtotal = 0;
    let calculatedTax = 0;
    let calculatedTotal = 0;

    if (input.items && Array.isArray(input.items) && input.items.length > 0) {
      for (const item of input.items) {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unitPrice) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const lineTotal = qty * price;
        const lineTax = lineTotal * (taxRate / 100);
        calculatedSubtotal += lineTotal;
        calculatedTax += lineTax;
      }
      calculatedTotal = calculatedSubtotal + calculatedTax;
    } else if (input.amount != null) {
      calculatedTotal = Number(input.amount);
      calculatedSubtotal = calculatedTotal;
    }

    const finalSubtotal = input.subtotal != null ? new Prisma.Decimal(input.subtotal.toString()) : new Prisma.Decimal(calculatedSubtotal.toFixed(2));
    const finalTaxAmount = input.taxAmount != null ? new Prisma.Decimal(input.taxAmount.toString()) : new Prisma.Decimal(calculatedTax.toFixed(2));
    const finalTotalAmount = input.totalAmount != null ? new Prisma.Decimal(input.totalAmount.toString()) : new Prisma.Decimal(calculatedTotal.toFixed(2));

    const customerName = input.customerName || targetEnquiry.customer?.name || targetEnquiry.companyName || '';
    const customerPhone = input.customerPhone || targetEnquiry.customer?.phone || targetEnquiry.phone || '';
    const companyName = input.companyName || targetEnquiry.companyName || targetEnquiry.customer?.companyName || '';

    const quotation = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          quotationNumber: nextQuotationNumber,
          enquiryId: targetEnquiry.id,
          createdById: user.userId,
          status: QuotationStatus.CREATED,
          amount: finalTotalAmount,
          subtotal: finalSubtotal,
          taxAmount: finalTaxAmount,
          totalAmount: finalTotalAmount,
          items: input.items ? (input.items as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          terms: input.terms?.trim() || null,
          notes: input.notes?.trim() || null,
          customerName,
          customerPhone,
          companyName,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true, phone: true },
          },
          enquiry: {
            select: {
              id: true,
              enquiryCode: true,
              companyName: true,
              phone: true,
              customer: true,
            },
          },
        },
      });

      // Record Activity
      await tx.activity.create({
        data: {
          enquiryId: targetEnquiry.id,
          userId: user.userId,
          type: ActivityType.REMARK_ADDED,
          description: `Generated Quotation ${nextQuotationNumber} for ₹${finalTotalAmount.toString()}`,
        },
      });

      return created;
    });

    return quotation;
  }

  /**
   * Marks a quotation as sent via WhatsApp, updates parent enquiry status and adds activity logs.
   */
  public async markQuotationSentViaWhatsApp(
    user: AuthUserPayload,
    quotationId: string,
  ) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        enquiry: true,
        createdBy: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation not found');
    }

    const hasAccess = await canAccessEnquiry(user, quotation.enquiryId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have permission to update this quotation');
    }

    const now = new Date();
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.quotation.update({
        where: { id: quotationId },
        data: {
          status: QuotationStatus.SENT,
          sentAt: now,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true, role: true, phone: true } },
          enquiry: {
            select: { id: true, enquiryCode: true, customerId: true, companyName: true, phone: true },
          },
        },
      });

      // Auto-update parent enquiry status if prior to quotation sent
      const priorStatuses: EnquiryStatus[] = [
        EnquiryStatus.NEW,
        EnquiryStatus.ASSIGNED,
        EnquiryStatus.CONTACTED,
        EnquiryStatus.FOLLOW_UP_REQUIRED,
      ];
      if (priorStatuses.includes(quotation.enquiry.status)) {
        await tx.enquiry.update({
          where: { id: quotation.enquiryId },
          data: {
            status: EnquiryStatus.QUOTATION_SENT,
            lastContactedAt: now,
          },
        });

        await tx.statusHistory.create({
          data: {
            enquiryId: quotation.enquiryId,
            changedById: user.userId,
            oldStatus: quotation.enquiry.status,
            newStatus: EnquiryStatus.QUOTATION_SENT,
            reason: `Quotation ${quotation.quotationNumber || ''} dispatched via WhatsApp`,
          },
        });
      }

      // Log Activity on Enquiry
      const amountStr = quotation.totalAmount
        ? quotation.totalAmount.toString()
        : quotation.amount?.toString() || '0';

      await tx.activity.create({
        data: {
          enquiryId: quotation.enquiryId,
          userId: user.userId,
          type: ActivityType.WHATSAPP,
          description: `Dispatched Quotation ${quotation.quotationNumber || ''} (₹${amountStr}) to ${quotation.customerPhone || quotation.enquiry.phone} via WhatsApp.`,
        },
      });

      return updated;
    });
  }

  /**
   * Transitions quotation status according to legal state transitions.
   * CREATED -> SENT -> VIEWED -> ACCEPTED/REJECTED/EXPIRED/REVISED
   * REVISED -> SENT
   */
  public async transitionStatus(
    user: AuthUserPayload,
    quotationId: string,
    input: TransitionQuotationStatusInput,
  ) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation not found');
    }

    // Access check based on parent enquiry
    const hasAccess = await canAccessEnquiry(user, quotation.enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Quotation not found');
    }

    const currentStatus = quotation.status;
    const nextStatus = input.status;

    const allowedNext = LEGAL_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(nextStatus)) {
      throw new BadRequestError(
        `Invalid quotation status transition from ${currentStatus} to ${nextStatus}. Allowed next states: [${allowedNext.join(', ')}]`,
      );
    }

    const updateData: Prisma.QuotationUpdateInput = {
      status: nextStatus,
    };

    if (input.notes !== undefined) {
      updateData.notes = input.notes ? input.notes.trim() : null;
    }

    const now = new Date();

    if (nextStatus === QuotationStatus.SENT) {
      updateData.sentAt = now;
    } else if (
      nextStatus === QuotationStatus.ACCEPTED ||
      nextStatus === QuotationStatus.REJECTED
    ) {
      updateData.respondedAt = now;
    }

    // Perform quotation update and optional activity record in transaction
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.quotation.update({
        where: { id: quotationId },
        data: updateData,
        include: {
          createdBy: { select: { id: true, name: true, email: true, role: true, phone: true } },
          enquiry: {
            select: { id: true, enquiryCode: true, companyName: true },
          },
        },
      });

      if (nextStatus === QuotationStatus.SENT) {
        await tx.activity.create({
          data: {
            enquiryId: quotation.enquiryId,
            userId: user.userId,
            type: ActivityType.QUOTATION_SENT,
            description: `Quotation ${quotation.quotationNumber || ''} sent (Amount: ₹${quotation.totalAmount ? quotation.totalAmount.toString() : (quotation.amount?.toString() || 'N/A')})`,
          },
        });
      }

      return result;
    });

    return updated;
  }

  /**
   * Lists quotations for a specific enquiry.
   * Access: Caller must have access to parent enquiry.
   */
  public async listQuotationsByEnquiry(user: AuthUserPayload, enquiryId: string) {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    const quotations = await prisma.quotation.findMany({
      where: { enquiryId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return quotations;
  }

  /**
   * Retrieves a single quotation by ID.
   */
  public async getQuotationById(user: AuthUserPayload, quotationId: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true, phone: true },
        },
        enquiry: {
          include: {
            customer: true,
            assignedTo: {
              select: { id: true, name: true, email: true, role: true, phone: true },
            },
          },
        },
      },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation not found');
    }

    const hasAccess = await canAccessEnquiry(user, quotation.enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Quotation not found');
    }

    return quotation;
  }
}

export const quotationService = new QuotationService();
