import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export class DashboardController {
  /**
   * GET /dashboard/me
   */
  public async getMyDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const data = await dashboardService.getMyDashboard(req.user);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /dashboard/team
   */
  public async getTeamDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const managerId = typeof req.query.managerId === 'string' ? req.query.managerId : undefined;
      const data = await dashboardService.getTeamDashboard(req.user, managerId);
      res.status(200).json({
        status: 'success',
        data: data.team,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
