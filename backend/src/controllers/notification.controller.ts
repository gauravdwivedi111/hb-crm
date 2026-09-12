import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { notificationService } from '../services/notification.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export class NotificationController {
  private getId(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestError('Valid Notification ID is required');
    }
    return id.trim();
  }

  /**
   * GET /notifications
   */
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = listNotificationsQuerySchema.parse(req.query);
      const result = await notificationService.listNotifications(req.user.userId, query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/:id/read
   */
  public async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = this.getId(req);
      const notification = await notificationService.markAsRead(req.user.userId, id);

      res.status(200).json({
        status: 'success',
        message: 'Notification marked as read',
        data: { notification },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/read-all
   */
  public async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const result = await notificationService.markAllAsRead(req.user.userId);

      res.status(200).json({
        status: 'success',
        message: 'All notifications marked as read',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
