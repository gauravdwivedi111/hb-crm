import { Router } from 'express';
import { Role } from '@prisma/client';
import { settingsController } from '../controllers/settings.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const settingsRouter = Router();

// All settings routes require valid authentication
settingsRouter.use(requireAuth);

// GET /settings/forwarding-status - Lightweight status check for any authenticated user
settingsRouter.get('/forwarding-status', (req, res, next) => {
  settingsController.getForwardingStatus(req, res, next);
});

// GET /settings - Full system settings (Admin-only)
settingsRouter.get('/', requireRole(Role.ADMIN), (req, res, next) => {
  settingsController.getSettings(req, res, next);
});

// PATCH /settings - Update system settings (Admin-only)
settingsRouter.patch('/', requireRole(Role.ADMIN), (req, res, next) => {
  settingsController.updateSettings(req, res, next);
});
