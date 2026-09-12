import { Router } from 'express';
import { enquiryController } from '../controllers/enquiry.controller.js';
import { quotationController } from '../controllers/quotation.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const enquiryRouter = Router();

// Every route in this module requires an authenticated session
enquiryRouter.use(requireAuth);

// 1. POST /enquiries - Any authenticated user can create an enquiry
enquiryRouter.post('/', (req, res, next) => {
  enquiryController.create(req, res, next);
});

// 2. GET /enquiries - List enquiries scoped by hierarchical access rules
enquiryRouter.get('/', (req, res, next) => {
  enquiryController.list(req, res, next);
});

// 3. GET /enquiries/:id - Single enquiry with 404 anti-enumeration protection
enquiryRouter.get('/:id', (req, res, next) => {
  enquiryController.getById(req, res, next);
});

// 4. PATCH /enquiries/:id - General details update (disallows status & assignee)
enquiryRouter.patch('/:id', (req, res, next) => {
  enquiryController.update(req, res, next);
});

// 5. PATCH /enquiries/:id/status - Dedicated status transition with audit logs
enquiryRouter.patch('/:id/status', (req, res, next) => {
  enquiryController.changeStatus(req, res, next);
});

// 6. PATCH /enquiries/:id/assign - Reassignment (Manager+) or Forwarding (Owning Employee when enabled)
enquiryRouter.patch(
  '/:id/assign',
  (req, res, next) => {
    enquiryController.assign(req, res, next);
  },
);

// 7. POST /enquiries/:id/quotations - Create quotation for enquiry
enquiryRouter.post('/:id/quotations', (req, res, next) => {
  quotationController.create(req, res, next);
});

// 8. GET /enquiries/:id/quotations - List quotations for enquiry
enquiryRouter.get('/:id/quotations', (req, res, next) => {
  quotationController.listByEnquiry(req, res, next);
});
