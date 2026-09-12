import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { enquiryRouter } from './routes/enquiry.routes.js';
import { followupRouter } from './routes/followup.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { quotationRouter } from './routes/quotation.routes.js';
import { attachmentRouter } from './routes/attachment.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { searchRouter } from './routes/search.routes.js';
import { userRouter } from './routes/user.routes.js';
import { importRouter } from './routes/import.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { apiRouter } from './routes/index.js';
import { ForbiddenError } from './utils/errors.js';
import { generalRateLimiter } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/errorHandler.js';

export const createApp = (): Express => {
  const app = express();

  // Explicitly disable X-Powered-By to prevent technology stack fingerprinting
  app.disable('x-powered-by');

  // Helmet HTTP security headers with strict Content-Security-Policy for JSON API
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      hidePoweredBy: true,
    }),
  );

  // Active CORS origin validation - rejects unauthorized origins with 403 Forbidden
  const allowedOrigins = config.frontendUrl
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''));

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, server-to-server, curl, tests)
        if (!origin) {
          return callback(null, true);
        }
        const normalizedOrigin = origin.trim().replace(/\/+$/, '');
        if (allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }
        return callback(new ForbiddenError(`Origin '${origin}' is not allowed by CORS`));
      },
      credentials: true,
    }),
  );

  // Body and cookie parsing with strict payload size limits (1MB) to prevent payload DoS
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Global rate limiter across all routes to prevent abuse on read and write endpoints
  app.use(generalRateLimiter);

  // Root health endpoint (GET /health)
  app.use('/health', healthRouter);

  // Authentication routes (POST /auth/register, /auth/login, etc.)
  app.use('/auth', authRouter);

  // Enquiry routes (POST /enquiries, GET /enquiries, etc.)
  app.use('/enquiries', enquiryRouter);

  // Follow-up routes (POST /followups, GET /followups, etc.)
  app.use('/followups', followupRouter);

  // Notification routes (GET /notifications, etc.)
  app.use('/notifications', notificationRouter);

  // Customer routes (POST /customers, GET /customers, etc.)
  app.use('/customers', customerRouter);

  // Quotation routes (PATCH /quotations/:id/status, etc.)
  app.use('/quotations', quotationRouter);

  // Attachment routes (POST /attachments, GET /attachments/:id/download, etc.)
  app.use('/attachments', attachmentRouter);

  // Dashboard routes (GET /dashboard/me, GET /dashboard/team)
  app.use('/dashboard', dashboardRouter);

  // Report routes (GET /reports/performance)
  app.use('/reports', reportRouter);

  // Global search route (GET /search)
  app.use('/search', searchRouter);

  // User management routes (GET /users, PATCH /users/:id/status - Admin only)
  app.use('/users', userRouter);

  // CSV bulk import routes (POST /import/enquiries - Manager+ only)
  app.use('/import', importRouter);

  // System settings routes (GET /settings, PATCH /settings - Admin only, GET /settings/forwarding-status)
  app.use('/settings', settingsRouter);

  // Central API router for entity endpoints
  app.use('/api', apiRouter);

  // Global error handler
  app.use(errorHandler);

  return app;
};

export const app = createApp();
export default app;
