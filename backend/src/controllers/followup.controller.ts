import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FollowupStatus, FollowupFrequency } from '@prisma/client';
import { followupService } from '../services/followup.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export const createFollowupSchema = z
  .object({
    enquiryId: z.string().trim().min(1).optional().nullable(),
    customerId: z.string().trim().min(1).optional().nullable(),
    dueAt: z
      .string()
      .trim()
      .refine(
        (val) => {
          const d = new Date(val);
          return !isNaN(d.getTime()) && d > new Date();
        },
        { message: 'dueAt must be a valid future ISO datetime' },
      ),
    purpose: z.string().trim().optional().nullable(),
    frequency: z.nativeEnum(FollowupFrequency, {
      message: 'Invalid follow-up frequency',
    }).default(FollowupFrequency.ONE_TIME),
    assignedToId: z.string().trim().min(1).optional().nullable(),
  })
  .refine(
    (data) => (data.enquiryId && !data.customerId) || (!data.enquiryId && data.customerId),
    {
      message: 'Exactly one of enquiryId OR customerId must be provided',
      path: ['enquiryId'],
    },
  );

export const listFollowupsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(FollowupStatus).optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  enquiryId: z.string().trim().optional(),
  customerId: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
});

export class FollowupController {
  private getId(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestError('Valid Follow-up ID is required');
    }
    return id.trim();
  }

  /**
   * POST /followups
   */
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const validated = createFollowupSchema.parse(req.body);
      const followup = await followupService.createFollowup(req.user, {
        enquiryId: validated.enquiryId || undefined,
        customerId: validated.customerId || undefined,
        dueAt: validated.dueAt,
        purpose: validated.purpose || undefined,
        frequency: validated.frequency,
        assignedToId: validated.assignedToId || undefined,
      });

      res.status(201).json({
        status: 'success',
        message: 'Follow-up scheduled successfully',
        data: { followup },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /followups
   */
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = listFollowupsQuerySchema.parse(req.query);
      const result = await followupService.listFollowups(req.user, query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /followups/:id/complete
   */
  public async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const result = await followupService.completeFollowup(req.user, id);

      res.status(200).json({
        status: 'success',
        message: 'Follow-up marked as completed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /followups/:id/reassign
   */
  public async reassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const schema = z.object({
        assignedToId: z.string().trim().min(1, 'Target user ID is required'),
      });
      const { assignedToId } = schema.parse(req.body);

      const followup = await followupService.reassignFollowup(req.user, id, assignedToId);

      res.status(200).json({
        status: 'success',
        message: 'Follow-up reassigned successfully',
        data: { followup },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const followupController = new FollowupController();
