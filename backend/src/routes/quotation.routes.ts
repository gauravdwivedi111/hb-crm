import { Router } from 'express';
import { quotationController } from '../controllers/quotation.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const quotationRouter = Router();

// All quotation routes require authentication
quotationRouter.use(requireAuth);

// 1. GET /quotations - List all quotations with filters & search
quotationRouter.get('/', (req, res, next) => {
  quotationController.listAll(req, res, next);
});

// 2. POST /quotations - Create quotation (supports enquiryCode or enquiryId and line items)
quotationRouter.post('/', (req, res, next) => {
  quotationController.create(req, res, next);
});

// 3. POST /quotations/:id/whatsapp-sent - Mark quotation as sent via WhatsApp and update enquiry status
quotationRouter.post('/:id/whatsapp-sent', (req, res, next) => {
  quotationController.markWhatsAppSent(req, res, next);
});

// 4. PATCH /quotations/:id/status - Transition quotation status
quotationRouter.patch('/:id/status', (req, res, next) => {
  quotationController.transitionStatus(req, res, next);
});

// 5. GET /quotations/:id - Retrieve quotation details
quotationRouter.get('/:id', (req, res, next) => {
  quotationController.getById(req, res, next);
});
