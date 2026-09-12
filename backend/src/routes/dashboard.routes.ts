import { Router } from 'express';
import { Role } from '@prisma/client';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// 1. GET /dashboard/me - Personal & scoped dashboard counts
dashboardRouter.get('/me', (req, res, next) => {
  dashboardController.getMyDashboard(req, res, next);
});

// 2. GET /dashboard/team - Manager+ team breakdown
dashboardRouter.get(
  '/team',
  requireRole(Role.ADMIN, Role.DGM, Role.AGM, Role.MANAGER),
  (req, res, next) => {
    dashboardController.getTeamDashboard(req, res, next);
  },
);
