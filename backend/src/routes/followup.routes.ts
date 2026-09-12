import { Router } from 'express';
import { followupController } from '../controllers/followup.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const followupRouter = Router();

// Follow-up endpoints require authentication
followupRouter.use(requireAuth);

// 1. POST /followups - Schedule a follow-up
followupRouter.post('/', (req, res, next) => {
  followupController.create(req, res, next);
});

// 2. GET /followups - List follow-ups with role-based scoping
followupRouter.get('/', (req, res, next) => {
  followupController.list(req, res, next);
});

// 3. PATCH /followups/:id/complete - Complete follow-up and schedule recurrence
followupRouter.patch('/:id/complete', (req, res, next) => {
  followupController.complete(req, res, next);
});

// 4. PATCH /followups/:id/reassign - Reassign follow-up to another user
followupRouter.patch('/:id/reassign', (req, res, next) => {
  followupController.reassign(req, res, next);
});
