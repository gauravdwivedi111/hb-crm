import { Router } from 'express';
import { Role } from '@prisma/client';
import { authController } from '../controllers/auth.controller.js';
import {
  requireAuth,
  requireRole,
  authRateLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
} from '../middleware/auth.middleware.js';

export const authRouter = Router();

// Protected admin-only registration (no public signup)
authRouter.post('/register', requireAuth, requireRole(Role.ADMIN), (req, res, next) => {
  authController.register(req, res, next);
});

// Login with IP rate limiting
authRouter.post('/login', authRateLimiter, (req, res, next) => {
  authController.login(req, res, next);
});

// Refresh token with IP rate limiting and token rotation
authRouter.post('/refresh', authRateLimiter, (req, res, next) => {
  authController.refresh(req, res, next);
});

// Logout (revokes token and clears cookie)
authRouter.post('/logout', (req, res, next) => {
  authController.logout(req, res, next);
});

// Forgot password request (anti-enumeration, rate-limited per IP and per email)
authRouter.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  (req, res, next) => {
    authController.forgotPassword(req, res, next);
  },
);

// Reset password using token
authRouter.post('/reset-password', authRateLimiter, (req, res, next) => {
  authController.resetPassword(req, res, next);
});

/**
 * Temporary verification test route for RBAC testing:
 * Only users with role EMPLOYEE are permitted.
 */
authRouter.get(
  '/test/employee-only',
  requireAuth,
  requireRole(Role.EMPLOYEE),
  (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Access granted to employee-only route',
      user: req.user,
    });
  },
);
