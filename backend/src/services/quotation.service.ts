import {
  Prisma,
  QuotationStatus,
  ActivityType,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { canAccessEnquiry } from './enquiry.access.js';
import {
  NotFoundError,
  BadRequestError,
} from '../utils/errors.js';

export interface CreateQuotationInput {
  amount?: number | string | Prisma.Decimal | null;
  notes?: string | null;
}

export interface TransitionQuotationStatusInput {
  status: QuotationStatus;
  notes?: string | null;
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
   * Creates a quotation for an enquiry with status CREATED.
   * Access: Caller must have access to parent enquiry.
   */
  public async createQuotation(
    user: AuthUserPayload,
    enquiryId: string,
    input: CreateQuotationInput,
  ) {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    const quotation = await prisma.quotation.create({
      data: {
        enquiryId,
        createdById: user.userId,
        status: QuotationStatus.CREATED,
        amount: input.amount !== undefined && input.amount !== null
          ? new Prisma.Decimal(input.amount.toString())
          : null,
        notes: input.notes ? input.notes.trim() : null,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return quotation;
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
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      if (nextStatus === QuotationStatus.SENT) {
        await tx.activity.create({
          data: {
            enquiryId: quotation.enquiryId,
            userId: user.userId,
            type: ActivityType.QUOTATION_SENT,
            description: `Quotation sent (Amount: ${quotation.amount ? quotation.amount.toString() : 'N/A'})`,
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
          select: { id: true, name: true, email: true },
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
          select: { id: true, name: true, email: true },
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
