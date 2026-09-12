import { Router } from 'express';
import { customerController } from '../controllers/customer.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const customerRouter = Router();

// All customer routes require authentication
customerRouter.use(requireAuth);

// 1. POST /customers - Create a customer
customerRouter.post('/', (req, res, next) => {
  customerController.create(req, res, next);
});

// 2. GET /customers - List customers with role-based scoping
customerRouter.get('/', (req, res, next) => {
  customerController.list(req, res, next);
});

// 3. GET /customers/:id - Retrieve customer details
customerRouter.get('/:id', (req, res, next) => {
  customerController.getById(req, res, next);
});

// 4. PATCH /customers/:id - Update customer details
customerRouter.patch('/:id', (req, res, next) => {
  customerController.update(req, res, next);
});
