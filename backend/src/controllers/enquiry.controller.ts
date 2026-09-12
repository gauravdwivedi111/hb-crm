import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EnquiryStatus, Priority } from '@prisma/client';
import { enquiryService } from '../services/enquiry.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export const inlineCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  phone: z.string().trim().min(1, 'Customer phone is required'),
  email: z.string().trim().email('Invalid customer email').optional().nullable(),
  companyName: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const createEnquirySchema = z
  .object({
    customerId: z.string().trim().optional().nullable(),
    customer: inlineCustomerSchema.optional().nullable(),
    companyName: z.string().trim().optional().nullable(),
    phone: z.string().trim().min(1, 'Phone is required'),
    email: z.string().trim().email('Invalid email address').optional().nullable(),
    location: z.string().trim().optional().nullable(),
    source: z.string().trim().optional().nullable(),
    product: z.string().trim().optional().nullable(),
    priority: z.nativeEnum(Priority, { message: 'Invalid priority value' }).optional(),
    expectedValue: z.union([z.number(), z.string()]).optional().nullable(),
    remarks: z.string().trim().optional().nullable(),
    assignedToId: z.string().trim().optional().nullable(),
  })
  .refine((data) => data.customerId || data.customer, {
    message: 'Either customerId or inline customer information (name, phone) must be provided',
    path: ['customerId'],
  });

export const listEnquiriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(EnquiryStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assignedToId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const updateEnquirySchema = z
  .object({
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email('Invalid email').optional().nullable(),
    location: z.string().trim().optional().nullable(),
    source: z.string().trim().optional().nullable(),
    product: z.string().trim().optional().nullable(),
    priority: z.nativeEnum(Priority).optional(),
    expectedValue: z.union([z.number(), z.string()]).optional().nullable(),
    remarks: z.string().trim().optional().nullable(),
    // Strictly prevent status or assignedToId on this endpoint
    status: z.never({ message: 'Use PATCH /enquiries/:id/status to update enquiry status' }).optional(),
    assignedToId: z.never({ message: 'Use PATCH /enquiries/:id/assign to reassign enquiry' }).optional(),
  });

export const changeStatusSchema = z.object({
  newStatus: z.nativeEnum(EnquiryStatus, { message: 'Invalid enquiry status value' }),
  reason: z.string().trim().optional().nullable(),
});

export const assignEnquirySchema = z.object({
  assignedToId: z.string().trim().min(1, 'assignedToId is required'),
});

export class EnquiryController {
  /**
   * POST /enquiries
   * Creates a new Enquiry (Status: NEW).
   */
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const validated = createEnquirySchema.parse(req.body);
      const enquiry = await enquiryService.createEnquiry(req.user, {
        ...validated,
        customerId: validated.customerId || undefined,
        customer: validated.customer || undefined,
        companyName: validated.companyName || undefined,
        email: validated.email || undefined,
        location: validated.location || undefined,
        source: validated.source || undefined,
        product: validated.product || undefined,
        expectedValue: validated.expectedValue ?? undefined,
        remarks: validated.remarks || undefined,
        assignedToId: validated.assignedToId || undefined,
      });

      res.status(201).json({
        status: 'success',
        message: 'Enquiry created successfully',
        data: { enquiry },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /enquiries
   * List enquiries scoped to user role and hierarchy.
   */
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = listEnquiriesQuerySchema.parse(req.query);
      const result = await enquiryService.listEnquiries(req.user, query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper to safely extract string ID from Express request params
   */
  private getId(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestError('Valid Enquiry ID is required');
    }
    return id.trim();
  }

  /**
   * GET /enquiries/:id
   * Get single enquiry details (returns 404 if not found or unauthorized).
   */
  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const enquiry = await enquiryService.getEnquiryById(req.user, id);

      res.status(200).json({
        status: 'success',
        data: { enquiry },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /enquiries/:id
   * Update general fields (status & assignedToId disallowed).
   */
  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const validated = updateEnquirySchema.parse(req.body);
      const updated = await enquiryService.updateEnquiry(req.user, id, {
        ...validated,
        email: validated.email || undefined,
        location: validated.location || undefined,
        source: validated.source || undefined,
        product: validated.product || undefined,
        expectedValue: validated.expectedValue ?? undefined,
        remarks: validated.remarks || undefined,
      });

      res.status(200).json({
        status: 'success',
        message: 'Enquiry updated successfully',
        data: { enquiry: updated },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /enquiries/:id/status
   * Change status with Activity and StatusHistory logs.
   */
  public async changeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const validated = changeStatusSchema.parse(req.body);
      const updated = await enquiryService.changeStatus(req.user, id, {
        newStatus: validated.newStatus,
        reason: validated.reason || undefined,
      });

      res.status(200).json({
        status: 'success',
        message: `Enquiry status changed to ${validated.newStatus}`,
        data: { enquiry: updated },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /enquiries/:id/assign
   * Reassign enquiry (Manager+ only).
   */
  public async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const validated = assignEnquirySchema.parse(req.body);
      const updated = await enquiryService.assignEnquiry(req.user, id, validated.assignedToId);

      res.status(200).json({
        status: 'success',
        message: 'Enquiry assigned successfully',
        data: { enquiry: updated },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const enquiryController = new EnquiryController();
