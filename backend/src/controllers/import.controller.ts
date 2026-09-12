import { Request, Response, NextFunction } from 'express';
import { importService } from '../services/import.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export class ImportController {
  /**
   * POST /import/enquiries
   * Accepts a CSV file upload, processes it row-by-row, and returns import metrics and error details.
   */
  public async importEnquiries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      if (!req.file) {
        throw new BadRequestError('CSV file is required. Please upload a .csv file using the "file" field.');
      }

      const originalName = req.file.originalname.toLowerCase();
      if (!originalName.endsWith('.csv') && req.file.mimetype !== 'text/csv' && req.file.mimetype !== 'text/plain') {
        throw new BadRequestError('Invalid file type. Only .csv files are supported.');
      }

      const result = await importService.importEnquiries(req.user, req.file.buffer);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const importController = new ImportController();
