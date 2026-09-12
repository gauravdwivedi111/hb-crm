import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { userService } from '../services/user.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export const listUsersQuerySchema = z.object({
  role: z.nativeEnum(Role).optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export class UserController {
  /**
   * GET /users/employees
   * List active employees for peer forwarding dropdown.
   */
  public async listActiveEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const employees = await userService.listActiveEmployees();

      res.status(200).json({
        status: 'success',
        data: employees,
        count: employees.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /users
   * Admin-only listing of all users.
   */
  public async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = listUsersQuerySchema.parse(req.query);
      const users = await userService.listUsers(query);

      res.status(200).json({
        status: 'success',
        data: users,
        count: users.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /users/:id/status
   * Admin-only toggle of user active/inactive status with instant token revocation.
   */
  public async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const rawId = req.params.id;
      const targetUserId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!targetUserId) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: 'User ID is required in URL path',
            path: ['id'],
          },
        ]);
      }

      const { isActive } = updateUserStatusSchema.parse(req.body);
      const user = await userService.updateUserStatus(req.user.userId, targetUserId, isActive);

      res.status(200).json({
        status: 'success',
        message: `User account ${isActive ? 'reactivated' : 'deactivated'} successfully`,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /users/:id/profile
   * Manager+ subordinate profile & KPI aggregation.
   */
  public async getUserProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const rawId = req.params.id;
      const targetUserId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!targetUserId) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: 'User ID is required in URL path',
            path: ['id'],
          },
        ]);
      }

      const profile = await userService.getUserProfile(req.user, targetUserId);

      res.status(200).json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
