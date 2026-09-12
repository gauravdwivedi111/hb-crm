import { Router } from 'express';
import { quotationController } from '../controllers/quotation.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const quotationRouter = Router();

// All quotation routes require authentication
quotationRouter.use(requireAuth);

// 1. PATCH /quotations/:id/status - Transition quotation status
quotationRouter.patch('/:id/status', (req, res, next) => {
  quotationController.transitionStatus(req, res, next);
});

// 2. GET /quotations/:id - Retrieve quotation details
quotationRouter.get('/:id', (req, res, next) => {
  quotationController.getById(req, res, next);
});
