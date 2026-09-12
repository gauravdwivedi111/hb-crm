import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/errors.js';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

/**
 * Express middleware for single attachment file upload.
 * Enforces the 10MB maximum file size at the stream level before buffering.
 */
export const uploadSingleAttachment = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  multerInstance.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new BadRequestError(
              `File size exceeds maximum allowed limit of 10MB (${MAX_FILE_SIZE_BYTES} bytes)`,
            ),
          );
        }
        return next(new BadRequestError(`Upload error: ${err.message}`));
      }
      return next(err);
    }
    next();
  });
};
