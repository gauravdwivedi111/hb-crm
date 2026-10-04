import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { QuotationStatus } from '@prisma/client';
import { quotationService } from '../services/quotation.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export const quotationItemSchema = z.object({
  description: z.string().trim().min(1, 'Item description is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitPrice: z.coerce.number().nonnegative('Unit price cannot be negative'),
  taxRate: z.coerce.number().nonnegative('Tax rate cannot be negative').default(18),
  amount: z.coerce.number().nonnegative().optional(),
});

export const createQuotationSchema = z.object({
  enquiryId: z.string().trim().optional(),
  enquiryCode: z.string().trim().optional(),
  items: z.array(quotationItemSchema).optional(),
  subtotal: z.union([z.number().nonnegative(), z.string()]).optional().nullable(),
  taxAmount: z.union([z.number().nonnegative(), z.string()]).optional().nullable(),
  totalAmount: z.union([z.number().nonnegative(), z.string()]).optional().nullable(),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid currency format')]).optional().nullable(),
  terms: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  customerName: z.string().trim().optional().nullable(),
  customerPhone: z.string().trim().optional().nullable(),
  companyName: z.string().trim().optional().nullable(),
});

export const transitionStatusSchema = z.object({
  status: z.nativeEnum(QuotationStatus, {
    message: 'Invalid quotation status',
  }),
  notes: z.string().trim().optional().nullable(),
});

export const listQuotationsSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.nativeEnum(QuotationStatus).optional(),
  search: z.string().trim().optional(),
  enquiryId: z.string().trim().optional(),
});

export class QuotationController {
  private getId(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestError('Valid ID parameter is required');
    }
    return id.trim();
  }

  /**
   * GET /quotations
   * List all quotations with pagination and search.
   */
  public async listAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = listQuotationsSchema.parse(req.query);
      const result = await quotationService.listAllQuotations(req.user, query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /quotations OR POST /enquiries/:id/quotations
   * Creates a new quotation. Supports enquiryId, enquiryCode, and line items.
   */
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const rawEnquiryId = req.params.id;
      const paramEnquiryId = Array.isArray(rawEnquiryId) ? rawEnquiryId[0] : rawEnquiryId;
      const validated = createQuotationSchema.parse(req.body);

      const targetIdentifier = (paramEnquiryId && paramEnquiryId.trim() !== '')
        ? paramEnquiryId.trim()
        : (validated.enquiryCode || validated.enquiryId || '');

      if (!targetIdentifier) {
        throw new BadRequestError('Either enquiryId or enquiryCode is required to generate a quotation.');
      }

      const quotation = await quotationService.createQuotation(req.user, targetIdentifier, validated);

      res.status(201).json({
        status: 'success',
        message: 'Quotation generated successfully',
        data: quotation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /quotations/:id/whatsapp-sent
   * Marks quotation as sent via WhatsApp and logs activity.
   */
  public async markWhatsAppSent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const quotationId = this.getId(req);
      const updated = await quotationService.markQuotationSentViaWhatsApp(req.user, quotationId);

      res.status(200).json({
        status: 'success',
        message: 'Quotation marked as sent via WhatsApp',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /quotations/:id/status
   */
  public async transitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const quotationId = this.getId(req);
      const validated = transitionStatusSchema.parse(req.body);
      const updated = await quotationService.transitionStatus(req.user, quotationId, validated);

      res.status(200).json({
        status: 'success',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /enquiries/:id/quotations
   */
  public async listByEnquiry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const enquiryId = this.getId(req);
      const quotations = await quotationService.listQuotationsByEnquiry(req.user, enquiryId);

      res.status(200).json({
        status: 'success',
        data: quotations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /quotations/:id
   */
  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const quotationId = this.getId(req);
      const quotation = await quotationService.getQuotationById(req.user, quotationId);

      res.status(200).json({
        status: 'success',
        data: quotation,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const quotationController = new QuotationController();
