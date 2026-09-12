import { Router } from 'express';
import { Role } from '@prisma/client';
import { attachmentController } from '../controllers/attachment.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { uploadSingleAttachment } from '../middleware/upload.middleware.js';

export const attachmentRouter = Router();

// All attachment endpoints require authentication
attachmentRouter.use(requireAuth);

// 1. POST /attachments - Multipart upload for Enquiry or Customer
attachmentRouter.post('/', uploadSingleAttachment, (req, res, next) => {
  attachmentController.create(req, res, next);
});

// 2. GET /attachments/:id/download - Get 5-minute presigned download URL
attachmentRouter.get('/:id/download', (req, res, next) => {
  attachmentController.getDownloadUrl(req, res, next);
});

// 3. DELETE /attachments/:id - Hard delete attachment (Manager+ only)
attachmentRouter.delete(
  '/:id',
  requireRole(Role.ADMIN, Role.DGM, Role.AGM, Role.MANAGER),
  (req, res, next) => {
    attachmentController.delete(req, res, next);
  },
);
