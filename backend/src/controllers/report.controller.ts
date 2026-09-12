import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportService } from '../services/report.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export const performanceReportQuerySchema = z.object({
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  userId: z.string().trim().optional(),
});

export class ReportController {
  /**
   * GET /reports/performance
   */
  public async getPerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = performanceReportQuerySchema.parse(req.query);
      const result = await reportService.getPerformanceReport(req.user, query);

      res.status(200).json({
        status: 'success',
        data: result.metrics,
        dateRange: result.dateRange,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const reportController = new ReportController();
