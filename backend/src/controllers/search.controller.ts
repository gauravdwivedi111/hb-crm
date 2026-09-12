import { Request, Response, NextFunction } from 'express';
import { searchService } from '../services/search.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export class SearchController {
  /**
   * GET /search?q=...
   */
  public async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const results = await searchService.globalSearch(req.user, q);

      res.status(200).json({
        status: 'success',
        data: results,
        count: results.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();
