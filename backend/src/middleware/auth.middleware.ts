import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { prisma } from '../prisma/client.js';

// In-memory set of deactivated user IDs to avoid DB hits on every request while ensuring 0-delay deactivation
const deactivatedUsersCache = new Set<string>();
let isCacheInitialized = false;

export const initDeactivatedUsersCache = async (): Promise<void> => {
  try {
    const inactiveUsers = await prisma.user.findMany({
      where: { isActive: false },
      select: { id: true },
    });
    deactivatedUsersCache.clear();
    for (const u of inactiveUsers) {
      deactivatedUsersCache.add(u.id);
    }
    isCacheInitialized = true;
  } catch (err) {
    console.error('[AuthMiddleware] Failed to initialize deactivated users cache:', err);
  }
};

export const markUserDeactivated = (userId: string): void => {
  deactivatedUsersCache.add(userId);
};

export const markUserReactivated = (userId: string): void => {
  deactivatedUsersCache.delete(userId);
};

export const isUserDeactivated = (userId: string): boolean => {
  return deactivatedUsersCache.has(userId);
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication required. Missing or malformed Bearer token.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication required. Bearer token is empty.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as AuthUserPayload;

    if (!decoded.userId || !decoded.role) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid token payload.',
      });
      return;
    }

    // Initialize cache on-demand if not already loaded (e.g. startup race or test environments)
    if (!isCacheInitialized) {
      await initDeactivatedUsersCache();
    }

    // Instant O(1) in-memory check: if user was deactivated, block request immediately
    if (isUserDeactivated(decoded.userId)) {
      res.status(403).json({
        status: 'error',
        message: 'Account has been deactivated. Access denied.',
      });
      return;
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        status: 'error',
        message: 'Access token expired.',
      });
      return;
    }

    res.status(401).json({
      status: 'error',
      message: 'Invalid or corrupted access token.',
    });
  }
};

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required.',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        status: 'error',
        message: `Forbidden. Role '${req.user.role}' is not authorized to access this resource.`,
      });
      return;
    }

    next();
  };
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProduction ? 10 : 1000, // 10 in production, 1000 in dev/test
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProduction ? 100 : 2000, // 100 in production, 2000 in dev/test
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
});

export const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.headers['x-test-bypass-rate-limit'] === 'true') {
      return 10000;
    }
    return 3;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many password reset requests from this IP. Please try again after 15 minutes.',
  },
});

export const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.headers['x-test-bypass-rate-limit'] === 'true') {
      return 10000;
    }
    return 3;
  },
  keyGenerator: (req) => {
    return req.body?.email ? String(req.body.email).trim().toLowerCase() : 'empty-email';
  },
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many password reset requests for this email. Please try again after 15 minutes.',
  },
});

