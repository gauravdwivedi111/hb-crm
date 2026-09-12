import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { QuotationStatus } from '@prisma/client';
import { quotationService } from '../services/quotation.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export const createQuotationSchema = z.object({
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid currency format')]).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const transitionStatusSchema = z.object({
  status: z.nativeEnum(QuotationStatus, {
    message: 'Invalid quotation status',
  }),
  notes: z.string().trim().optional().nullable(),
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
   * POST /enquiries/:id/quotations
   */
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const enquiryId = this.getId(req);
      const validated = createQuotationSchema.parse(req.body);
      const quotation = await quotationService.createQuotation(req.user, enquiryId, validated);

      res.status(201).json({
        status: 'success',
        data: quotation,
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
