import { Router } from 'express';
import { Role } from '@prisma/client';
import { reportController } from '../controllers/report.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const reportRouter = Router();

reportRouter.use(requireAuth);

// 1. GET /reports/performance - Manager+ performance reporting
reportRouter.get(
  '/performance',
  requireRole(Role.ADMIN, Role.DGM, Role.AGM, Role.MANAGER),
  (req, res, next) => {
    reportController.getPerformance(req, res, next);
  },
);
