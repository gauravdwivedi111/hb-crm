import crypto from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { User, Role } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { config } from '../config/env.js';
import { SanitizedUser } from '../types/auth.types.js';
import { emailService } from './email.service.js';
import {
  UnauthorizedError,
  ForbiddenError,
  LockedError,
  ConflictError,
  BadRequestError,
} from '../utils/errors.js';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  supervisorId?: string | null;
}

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface AuthSuccessResult {
  accessToken: string;
  rawRefreshToken: string;
  user: SanitizedUser;
}

const sanitizeUser = (user: User): SanitizedUser => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    supervisorId: user.supervisorId,
    isActive: user.isActive,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateAccessToken = (userId: string, role: Role): string => {
  return jwt.sign({ userId, role }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
  });
};

export class AuthService {
  /**
   * Register a new user (Admin-only, protected).
   */
  public async registerUser(input: RegisterUserInput): Promise<SanitizedUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError('An account with this email address already exists');
    }

    // If supervisorId is provided, verify supervisor exists and is active
    if (input.supervisorId) {
      const supervisor = await prisma.user.findUnique({
        where: { id: input.supervisorId },
      });
      if (!supervisor || !supervisor.isActive) {
        throw new BadRequestError('Specified supervisor was not found or is inactive');
      }
    }

    // Hash password with argon2id
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: input.role,
        supervisorId: input.supervisorId || null,
      },
    });

    return sanitizeUser(user);
  }

  /**
   * Authenticate user, check lockout status, issue JWT and refresh token.
   */
  public async loginUser(input: LoginUserInput): Promise<AuthSuccessResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenError('Account is deactivated. Please contact an administrator.');
    }

    const now = new Date();

    // Check if user is currently locked out
    if (user.lockedUntil && user.lockedUntil > now) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / (60 * 1000));
      throw new LockedError(
        `Account is temporarily locked due to multiple failed login attempts. Try again in ${remainingMinutes} minute(s).`,
      );
    }

    // Verify password with argon2
    const isPasswordValid = await argon2.verify(user.passwordHash, input.password);

    if (!isPasswordValid) {
      // If a previous lockout has expired, start a fresh count at 1, otherwise increment
      const isPriorLockoutExpired = user.lockedUntil && user.lockedUntil <= now;
      const newFailedCount = isPriorLockoutExpired ? 1 : user.failedLoginCount + 1;

      if (newFailedCount >= 5) {
        const lockoutDurationMs = 15 * 60 * 1000; // 15 minutes
        const lockedUntil = new Date(Date.now() + lockoutDurationMs);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: newFailedCount,
            lockedUntil,
          },
        });

        throw new LockedError(
          'Invalid email or password. Maximum failed attempts reached; account locked for 15 minutes.',
        );
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: newFailedCount,
            lockedUntil: null,
          },
        });

        throw new UnauthorizedError('Invalid email or password');
      }
    }

    // On successful login: reset failed login count and clear lockedUntil
    if (user.failedLoginCount > 0 || user.lockedUntil !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
    }

    // Issue JWT access token
    const accessToken = generateAccessToken(user.id, user.role);

    // Issue cryptographically random refresh token
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000,
    );

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: refreshExpiresAt,
        revoked: false,
      },
    });

    return {
      accessToken,
      rawRefreshToken,
      user: sanitizeUser(user),
    };
  }

  /**
   * Rotate refresh token and issue a fresh access token.
   * Includes token reuse detection that invalidates all user tokens on theft detection.
   */
  public async refreshToken(rawRefreshToken?: string): Promise<AuthSuccessResult> {
    if (!rawRefreshToken || rawRefreshToken.trim() === '') {
      throw new UnauthorizedError('Refresh token required');
    }

    const tokenHash = hashToken(rawRefreshToken);

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Token Reuse Detection: If a revoked token is presented, revoke ALL tokens for that user
    if (tokenRecord.revoked) {
      await prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { revoked: true },
      });
      throw new UnauthorizedError(
        'Revoked token reuse detected. Potential security breach; all active sessions have been terminated.',
      );
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true },
      });
      throw new UnauthorizedError('Refresh token has expired. Please sign in again.');
    }

    // Verify user is still active
    if (!tokenRecord.user.isActive) {
      throw new ForbiddenError('Account is deactivated. Please contact an administrator.');
    }

    // Revoke the presented token (rotation)
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true },
    });

    // Generate new access and refresh token pair
    const accessToken = generateAccessToken(tokenRecord.user.id, tokenRecord.user.role);

    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000,
    );

    await prisma.refreshToken.create({
      data: {
        userId: tokenRecord.user.id,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
        revoked: false,
      },
    });

    return {
      accessToken,
      rawRefreshToken: newRawRefreshToken,
      user: sanitizeUser(tokenRecord.user),
    };
  }

  /**
   * Revoke refresh token and invalidate the session.
   */
  public async logoutUser(rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken && rawRefreshToken.trim() !== '') {
      const tokenHash = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revoked: false },
        data: { revoked: true },
      });
    }
  }

  /**
   * Request password reset link (anti-enumeration protected).
   */
  public async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericSuccessMessage =
      'If an account exists with this email, a reset link has been sent.';

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && user.isActive) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const resetUrl = `${config.frontendUrl}/reset-password?token=${rawToken}`;
      const emailSubject = '[HB CRM] Password Reset Request';
      const emailBody =
        `Hello ${user.name},\n\n` +
        `We received a request to reset the password for your HB CRM account.\n\n` +
        `To reset your password, please click the link below (or copy and paste it into your browser):\n` +
        `${resetUrl}\n\n` +
        `This link will expire in 30 minutes.\n\n` +
        `If you did not request a password reset, please ignore this email — your password will remain unchanged.\n\n` +
        `Best regards,\nHB CRM Security Team`;

      await emailService.sendEmail(user.email, emailSubject, emailBody);
    } else {
      // Anti-enumeration timing equalization:
      // Perform dummy crypto generation/hash and sleep to match valid lookup latency
      const dummyToken = crypto.randomBytes(32).toString('hex');
      hashToken(dummyToken);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return { message: genericSuccessMessage };
  }

  /**
   * Reset user password using presented reset token.
   */
  public async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      throw new BadRequestError('Invalid or expired password reset link. Please request a new one.');
    }

    if (!newPassword || newPassword.length < 10) {
      throw new BadRequestError('Password must be at least 10 characters long');
    }

    const tokenHash = hashToken(trimmedToken);

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // Anti-enumeration: do not distinguish "expired" from "invalid" from "already used" from "inactive"
    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt < new Date() ||
      !resetRecord.user.isActive
    ) {
      throw new BadRequestError('Invalid or expired password reset link. Please request a new one.');
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await prisma.$transaction(async (tx) => {
      // 1. Update user password and clear lockout state
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      // 2. Mark reset token as used
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });

      // 3. Revoke all existing refresh tokens for this user
      await tx.refreshToken.updateMany({
        where: { userId: resetRecord.userId, revoked: false },
        data: { revoked: true },
      });
    });

    return {
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };
  }
}

export const authService = new AuthService();
