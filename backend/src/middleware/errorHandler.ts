import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config/env.js';
import { HttpError } from '../utils/errors.js';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle Custom HttpErrors
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // Handle Express body-parser PayloadTooLargeError (413)
  const errWithMeta = err as { type?: string; status?: number; statusCode?: number };
  if (errWithMeta.type === 'entity.too.large' || errWithMeta.status === 413 || errWithMeta.statusCode === 413) {
    res.status(413).json({
      status: 'error',
      message: 'Payload too large. Request body cannot exceed 1MB.',
    });
    return;
  }

  // Handle explicit status codes attached to errors (e.g. from CORS or middleware)
  const explicitStatus = errWithMeta.statusCode || errWithMeta.status;
  if (explicitStatus && typeof explicitStatus === 'number' && explicitStatus >= 400 && explicitStatus < 500) {
    res.status(explicitStatus).json({
      status: 'error',
      message: err.message || 'Request error',
    });
    return;
  }

  // Generic server error - never leak internal paths, stack traces, or DB internals
  console.error('[Unhandled Error]', err);

  res.status(500).json({
    status: 'error',
    message: config.isProduction ? 'Internal server error' : err.message || 'Internal server error',
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
};
