import { Request, Response, NextFunction, CookieOptions } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { authService } from '../services/auth.service.js';
import { config } from '../config/env.js';

// Input validation schemas
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(10, 'Password must be at least 10 characters long'),
  role: z.nativeEnum(Role, { message: 'Invalid role specified' }),
  supervisorId: z.string().trim().min(1).nullable().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

export const resetPasswordWithOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
  newPassword: z.string().min(10, 'Password must be at least 10 characters long'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  otp: z.string().trim().optional(),
  newPassword: z.string().min(10, 'Password must be at least 10 characters long'),
});

const REFRESH_COOKIE_NAME = 'refreshToken';

const getRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? config.cookieSameSite : 'lax',
  path: '/',
  maxAge: config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000,
});

export class AuthController {
  /**
   * POST /auth/register
   * Admin-only registration of new users.
   */
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = registerSchema.parse(req.body);
      const user = await authService.registerUser(validatedInput);

      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login
   * Authenticates credentials, sets refresh cookie, returns access token + user.
   */
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = loginSchema.parse(req.body);
      const result = await authService.loginUser(validatedInput);

      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, getRefreshCookieOptions());

      res.status(200).json({
        status: 'success',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh
   * Verifies cookie refresh token, rotates tokens, returns new access token.
   */
  public async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      const result = await authService.refreshToken(rawRefreshToken);

      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, getRefreshCookieOptions());

      res.status(200).json({
        status: 'success',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout
   * Revokes refresh token in database and clears cookie.
   */
  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      await authService.logoutUser(rawRefreshToken);

      res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());

      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/forgot-password
   * Request password reset link (anti-enumeration protected).
   */
  public async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = forgotPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(validatedInput.email);

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: { message: result.message },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password-otp
   * Reset user password using 6-digit OTP received via email.
   */
  public async resetPasswordWithOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = resetPasswordWithOtpSchema.parse(req.body);
      const result = await authService.resetPasswordWithOtp(
        validatedInput.email,
        validatedInput.otp,
        validatedInput.newPassword,
      );

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: { message: result.message },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password
   * Reset user password using token or OTP.
   */
  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = resetPasswordSchema.parse(req.body);

      // If email and OTP are provided, handle as OTP reset
      if (validatedInput.email && validatedInput.otp) {
        const result = await authService.resetPasswordWithOtp(
          validatedInput.email,
          validatedInput.otp,
          validatedInput.newPassword,
        );

        res.status(200).json({
          status: 'success',
          message: result.message,
          data: { message: result.message },
        });
        return;
      }

      // Otherwise handle as token link reset
      if (!validatedInput.token) {
        res.status(400).json({
          status: 'error',
          message: 'Reset token or email & OTP are required to reset password.',
        });
        return;
      }

      const result = await authService.resetPassword(
        validatedInput.token,
        validatedInput.newPassword,
      );

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: { message: result.message },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
