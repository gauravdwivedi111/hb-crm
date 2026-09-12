import { Router } from 'express';
import { Role } from '@prisma/client';
import { importController } from '../controllers/import.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { uploadSingleAttachment } from '../middleware/upload.middleware.js';

export const importRouter = Router();

importRouter.use(requireAuth);

/**
 * POST /import/enquiries
 * Bulk upload and import enquiries from a CSV file.
 * Role-gated: Manager+ (ADMIN, DGM, AGM, MANAGER) only.
 */
importRouter.post(
  '/enquiries',
  requireRole(Role.ADMIN, Role.DGM, Role.AGM, Role.MANAGER),
  uploadSingleAttachment,
  (req, res, next) => {
    importController.importEnquiries(req, res, next);
  },
);
