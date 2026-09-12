import { Request, Response, NextFunction } from 'express';
import { attachmentService } from '../services/attachment.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export class AttachmentController {
  private getId(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestError('Valid Attachment ID is required');
    }
    return id.trim();
  }

  /**
   * POST /attachments
   */
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const enquiryId = typeof req.body.enquiryId === 'string' ? req.body.enquiryId : undefined;
      const customerId = typeof req.body.customerId === 'string' ? req.body.customerId : undefined;

      const attachment = await attachmentService.createAttachment(
        req.user,
        req.file,
        { enquiryId, customerId },
      );

      res.status(201).json({
        status: 'success',
        data: attachment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /attachments/:id/download
   */
  public async getDownloadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const attachmentId = this.getId(req);
      const downloadInfo = await attachmentService.getDownloadUrl(req.user, attachmentId);

      res.status(200).json({
        status: 'success',
        data: downloadInfo,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /attachments/:id
   */
  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const attachmentId = this.getId(req);
      const result = await attachmentService.deleteAttachment(req.user, attachmentId);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const attachmentController = new AttachmentController();
