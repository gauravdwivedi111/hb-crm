import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const notificationRouter = Router();

// Notification routes require authentication
notificationRouter.use(requireAuth);

// GET /notifications - List caller's notifications
notificationRouter.get('/', (req, res, next) => {
  notificationController.list(req, res, next);
});

// PATCH /notifications/read-all - Mark all caller's notifications as read
// (Must be declared before /:id/read to prevent route shadowing)
notificationRouter.patch('/read-all', (req, res, next) => {
  notificationController.markAllRead(req, res, next);
});

// PATCH /notifications/:id/read - Mark single notification as read
notificationRouter.patch('/:id/read', (req, res, next) => {
  notificationController.markRead(req, res, next);
});
