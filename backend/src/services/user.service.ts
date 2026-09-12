import {
  Role,
  Prisma,
  EnquiryStatus,
  FollowupStatus,
  QuotationStatus,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import {
  markUserDeactivated,
  markUserReactivated,
} from '../middleware/auth.middleware.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { getSubordinateUserIds, isManagerPlus } from './enquiry.access.js';
import {
  getTimezoneDayBoundaries,
  getTimezoneMonthBoundaries,
} from '../utils/date.js';
import {
  createInitialStatusCounts,
  StatusCounts,
  dashboardService,
  SubordinateMetrics,
} from './dashboard.service.js';

export interface UserProfileResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    supervisorId: string | null;
    supervisor: {
      id: string;
      name: string;
      email: string;
      role: Role;
    } | null;
    createdAt: Date;
  };
  countsByStatus: StatusCounts;
  followups: {
    dueToday: number;
    overdue: number;
  };
  quotationsPendingResponse: number;
  assignedCount: number;
  assignedThisMonth: number;
  contactedCount: number;
  overdueCount: number;
  convertedThisMonth: number;
  lostThisMonth: number;
  conversionRateThisMonth: number;
  performanceThisMonth: {
    converted: number;
    lost: number;
    conversionRate: number;
  };
  team?: SubordinateMetrics[];
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  supervisorId: string | null;
  supervisor: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListUsersFilter {
  role?: Role;
  isActive?: boolean;
}

export class UserService {
  /**
   * List all active employees for enquiry forwarding dropdown.
   */
  public async listActiveEmployees() {
    return prisma.user.findMany({
      where: {
        role: Role.EMPLOYEE,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * List all users with supervisor relations, strictly omitting password hashes.
   */
  public async listUsers(filter?: ListUsersFilter): Promise<AdminUserItem[]> {
    const where: Prisma.UserWhereInput = {};
    if (filter?.role) {
      where.role = filter.role;
    }
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        supervisorId: true,
        supervisor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        failedLoginCount: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return users;
  }

  /**
   * Deactivate or reactivate a user account.
   * If deactivating, revokes all unrevoked RefreshTokens immediately to terminate active sessions.
   * Prevents self-deactivation by the requesting administrator.
   */
  public async updateUserStatus(
    adminUserId: string,
    targetUserId: string,
    isActive: boolean,
  ): Promise<AdminUserItem> {
    if (adminUserId === targetUserId && !isActive) {
      throw new BadRequestError('You cannot deactivate your own administrative account.');
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!existingUser) {
      throw new NotFoundError('User not found.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If deactivating, immediately revoke all active refresh tokens for this user
      if (!isActive) {
        await tx.refreshToken.updateMany({
          where: {
            userId: targetUserId,
            revoked: false,
          },
          data: {
            revoked: true,
          },
        });
      }

      return tx.user.update({
        where: { id: targetUserId },
        data: {
          isActive,
          ...(isActive ? { failedLoginCount: 0, lockedUntil: null } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          supervisorId: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          failedLoginCount: true,
          lockedUntil: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    if (!isActive) {
      markUserDeactivated(targetUserId);
    } else {
      markUserReactivated(targetUserId);
    }

    return updated;
  }

  /**
   * GET /users/:id/profile
   * Manager+ only: retrieves target subordinate's profile and aggregated KPI stats.
   * Enforces anti-enumeration: returns 404 (NotFoundError) if target user is not in caller's hierarchy.
   */
  public async getUserProfile(
    caller: AuthUserPayload,
    targetUserId: string,
  ): Promise<UserProfileResponse> {
    // 1. Look up target user
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        supervisorId: true,
        supervisor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        createdAt: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundError('User not found.');
    }

    // 2. Anti-enumeration scoping check
    if (caller.role !== Role.ADMIN) {
      const isSelf = caller.userId === targetUserId;
      const subordinateIds = await getSubordinateUserIds(caller.userId);
      const isSubordinate = subordinateIds.includes(targetUserId);

      if (!isSelf && !isSubordinate) {
        // Strict anti-enumeration: 404 Not Found, never 403
        throw new NotFoundError('User not found.');
      }
    }

    // 3. Compute metrics for target user matching dashboard.service.ts
    const now = new Date();
    const { startOfDay, endOfDay } = getTimezoneDayBoundaries(now);
    const { startOfMonth, endOfMonth } = getTimezoneMonthBoundaries(now);

    const [
      enquiryStatusGroups,
      assignedCount,
      assignedThisMonth,
      contactedCount,
      convertedThisMonth,
      lostThisMonth,
      dueToday,
      overdue,
      quotationsPendingResponse,
    ] = await Promise.all([
      // Status breakdown
      prisma.enquiry.groupBy({
        by: ['status'],
        where: { assignedToId: targetUserId },
        _count: { id: true },
      }),
      // Total assigned
      prisma.enquiry.count({
        where: { assignedToId: targetUserId },
      }),
      // Assigned this month
      prisma.enquiry.count({
        where: {
          assignedToId: targetUserId,
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // Contacted count
      prisma.enquiry.count({
        where: {
          assignedToId: targetUserId,
          lastContactedAt: { not: null },
        },
      }),
      // Converted this month
      prisma.enquiry.count({
        where: {
          assignedToId: targetUserId,
          status: EnquiryStatus.CONVERTED,
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // Lost this month
      prisma.enquiry.count({
        where: {
          assignedToId: targetUserId,
          status: EnquiryStatus.LOST,
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // Follow-ups due today
      prisma.followup.count({
        where: {
          assignedToId: targetUserId,
          status: FollowupStatus.PENDING,
          dueAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      // Follow-ups overdue
      prisma.followup.count({
        where: {
          assignedToId: targetUserId,
          OR: [
            { status: FollowupStatus.OVERDUE },
            {
              status: FollowupStatus.PENDING,
              dueAt: { lt: now },
            },
          ],
        },
      }),
      // Quotations pending response
      prisma.quotation.count({
        where: {
          createdById: targetUserId,
          status: { in: [QuotationStatus.SENT, QuotationStatus.VIEWED] },
          respondedAt: null,
        },
      }),
    ]);

    const countsByStatus = createInitialStatusCounts();
    for (const group of enquiryStatusGroups) {
      countsByStatus[group.status] = group._count.id;
    }

    const conversionRateThisMonth =
      assignedThisMonth > 0
        ? Number(((convertedThisMonth / assignedThisMonth) * 100).toFixed(2))
        : 0;

    let team: SubordinateMetrics[] | undefined;
    if (isManagerPlus(targetUser.role)) {
      team = await dashboardService.getTeamDashboardForManager(targetUserId);
    }

    return {
      user: targetUser,
      countsByStatus,
      followups: {
        dueToday,
        overdue,
      },
      quotationsPendingResponse,
      assignedCount,
      assignedThisMonth,
      contactedCount,
      overdueCount: overdue,
      convertedThisMonth,
      lostThisMonth,
      conversionRateThisMonth,
      performanceThisMonth: {
        converted: convertedThisMonth,
        lost: lostThisMonth,
        conversionRate: conversionRateThisMonth,
      },
      team,
    };
  }
}

export const userService = new UserService();
