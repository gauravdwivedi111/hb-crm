import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { settingsService } from '../services/settings.service.js';
import { UnauthorizedError } from '../utils/errors.js';

const updateSettingsSchema = z.object({
  allowEmployeeReassignment: z.boolean(),
});

export class SettingsController {
  /**
   * GET /settings (Admin-only)
   */
  public async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const settings = await settingsService.getSettings();

      res.status(200).json({
        status: 'success',
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /settings (Admin-only)
   */
  public async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const validated = updateSettingsSchema.parse(req.body);
      const settings = await settingsService.updateSettings(validated.allowEmployeeReassignment);

      res.status(200).json({
        status: 'success',
        message: 'System settings updated successfully',
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /settings/forwarding-status (Any authenticated user)
   * Lightweight read endpoint so Enquiry Detail page can check flag without requiring Admin role.
   */
  public async getForwardingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const settings = await settingsService.getSettings();

      res.status(200).json({
        status: 'success',
        data: {
          allowEmployeeReassignment: settings.allowEmployeeReassignment,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
