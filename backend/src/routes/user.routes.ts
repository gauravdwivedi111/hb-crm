import { Router } from 'express';
import { Role } from '@prisma/client';
import { userController } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const userRouter = Router();

// All user routes require valid authentication
userRouter.use(requireAuth);

// GET /users/employees - List active employees for peer forwarding (any authenticated user)
userRouter.get('/employees', (req, res, next) => {
  userController.listActiveEmployees(req, res, next);
});

// GET /users/:id/profile - Single subordinate profile and metrics for Manager+
userRouter.get(
  '/:id/profile',
  requireRole(Role.ADMIN, Role.DGM, Role.AGM, Role.MANAGER),
  (req, res, next) => {
    userController.getUserProfile(req, res, next);
  },
);

// GET /users - List all users (Admin-only)
userRouter.get('/', requireRole(Role.ADMIN), (req, res, next) => {
  userController.listUsers(req, res, next);
});

// PATCH /users/:id/status - Deactivate or reactivate a user account (Admin-only)
userRouter.patch('/:id/status', requireRole(Role.ADMIN), (req, res, next) => {
  userController.updateUserStatus(req, res, next);
});

// DELETE /users/:id - Permanently delete a user account (Admin-only)
userRouter.delete('/:id', requireRole(Role.ADMIN), (req, res, next) => {
  userController.deleteUser(req, res, next);
});

