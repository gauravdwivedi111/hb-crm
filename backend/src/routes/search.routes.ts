import { Router } from 'express';
import { searchController } from '../controllers/search.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const searchRouter = Router();

searchRouter.use(requireAuth);

// 1. GET /search?q=... - Scoped global search
searchRouter.get('/', (req, res, next) => {
  searchController.search(req, res, next);
});
