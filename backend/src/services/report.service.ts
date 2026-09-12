import {
  Role,
  EnquiryStatus,
  FollowupStatus,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import {
  getSubordinateUserIds,
  isManagerPlus,
} from './enquiry.access.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';
import { getTimezoneMonthBoundaries } from '../utils/date.js';

export interface PerformanceReportQuery {
  startDate?: string;
  endDate?: string;
  userId?: string;
}

export interface UserPerformanceMetrics {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  enquiriesAssigned: number;
  contacted: number;
  followupsCompleted: number;
  followupsMissed: number;
  quotationsSent: number;
  converted: number;
  lost: number;
  conversionRate: number; // percentage (0-100)
  avgTimeToFirstContactHours: number | null;
  avgTimeToConversionHours: number | null;
}

export class ReportService {
  /**
   * GET /reports/performance
   * Manager+ only: computes performance metrics for specified user or whole team.
   */
  public async getPerformanceReport(
    caller: AuthUserPayload,
    query: PerformanceReportQuery,
  ): Promise<{ dateRange: { startDate: string; endDate: string }; metrics: UserPerformanceMetrics[] }> {
    if (!isManagerPlus(caller.role)) {
      throw new ForbiddenError('Only managers and administrators can access performance reports.');
    }

    const now = new Date();
    const { startOfMonth: defaultStart, endOfMonth: defaultEnd } = getTimezoneMonthBoundaries(now);

    const startDate = query.startDate ? new Date(query.startDate) : defaultStart;
    const endDate = query.endDate ? new Date(query.endDate) : defaultEnd;

    // Resolve target users
    let targetUsers: Array<{ id: string; name: string; email: string; role: Role }>;

    if (query.userId && query.userId.trim() !== '') {
      const requestedId = query.userId.trim();

      if (caller.role === Role.ADMIN) {
        const u = await prisma.user.findUnique({
          where: { id: requestedId },
          select: { id: true, name: true, email: true, role: true },
        });
        if (!u) throw new NotFoundError('User not found');
        targetUsers = [u];
      } else {
        const subordinateIds = await getSubordinateUserIds(caller.userId);
        const allowedIds = [caller.userId, ...subordinateIds];

        if (!allowedIds.includes(requestedId)) {
          throw new NotFoundError('User not found');
        }

        const u = await prisma.user.findUnique({
          where: { id: requestedId },
          select: { id: true, name: true, email: true, role: true },
        });
        if (!u) throw new NotFoundError('User not found');
        targetUsers = [u];
      }
    } else {
      // Default: entire team (caller + subordinates, or all users for Admin)
      if (caller.role === Role.ADMIN) {
        targetUsers = await prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        });
      } else {
        const subordinateIds = await getSubordinateUserIds(caller.userId);
        targetUsers = await prisma.user.findMany({
          where: {
            id: { in: [caller.userId, ...subordinateIds] },
            isActive: true,
          },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        });
      }
    }

    const userIds = targetUsers.map((u) => u.id);

    // Optimized batch queries across target users within date range
    const [
      assignedGroups,
      contactedGroups,
      followupsCompletedGroups,
      followupsMissedGroups,
      quotationsSentGroups,
      convertedGroups,
      lostGroups,
      contactedEnquiries,
      convertedEnquiries,
    ] = await Promise.all([
      // Enquiries assigned in date range
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: userIds },
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      // Enquiries contacted in date range
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: userIds },
          lastContactedAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      // Follow-ups completed in date range
      prisma.followup.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: userIds },
          status: FollowupStatus.COMPLETED,
          completedAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      // Follow-ups missed in date range
      prisma.followup.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: userIds },
          dueAt: { gte: startDate, lte: endDate },
          OR: [
            { status: FollowupStatus.OVERDUE },
            {
              status: FollowupStatus.PENDING,
              dueAt: { lt: now },
            },
          ],
        },
        _count: { id: true },
      }),
      // Quotations sent in date range
      prisma.quotation.groupBy({
        by: ['createdById'],
        where: {
          createdById: { in: userIds },
          sentAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      // Converted enquiries in date range
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: userIds },
          status: EnquiryStatus.CONVERTED,
          updatedAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      // Lost enquiries in date range
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: userIds },
          status: EnquiryStatus.LOST,
          updatedAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      // Enquiries for computing time-to-first-contact
      prisma.enquiry.findMany({
        where: {
          assignedToId: { in: userIds },
          lastContactedAt: { not: null },
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          assignedToId: true,
          createdAt: true,
          lastContactedAt: true,
        },
      }),
      // Enquiries for computing time-to-conversion
      prisma.enquiry.findMany({
        where: {
          assignedToId: { in: userIds },
          status: EnquiryStatus.CONVERTED,
          updatedAt: { gte: startDate, lte: endDate },
        },
        select: {
          assignedToId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const assignedMap = new Map(assignedGroups.map((g) => [g.assignedToId, g._count.id]));
    const contactedMap = new Map(contactedGroups.map((g) => [g.assignedToId, g._count.id]));
    const followupsCompletedMap = new Map(followupsCompletedGroups.map((g) => [g.assignedToId, g._count.id]));
    const followupsMissedMap = new Map(followupsMissedGroups.map((g) => [g.assignedToId, g._count.id]));
    const quotationsSentMap = new Map(quotationsSentGroups.map((g) => [g.createdById, g._count.id]));
    const convertedMap = new Map(convertedGroups.map((g) => [g.assignedToId, g._count.id]));
    const lostMap = new Map(lostGroups.map((g) => [g.assignedToId, g._count.id]));

    // Compute average durations per user
    const contactDurationsByUser = new Map<string, number[]>();
    for (const e of contactedEnquiries) {
      if (e.assignedToId && e.lastContactedAt) {
        const diffHours = (e.lastContactedAt.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60);
        if (diffHours >= 0) {
          const list = contactDurationsByUser.get(e.assignedToId) || [];
          list.push(diffHours);
          contactDurationsByUser.set(e.assignedToId, list);
        }
      }
    }

    const conversionDurationsByUser = new Map<string, number[]>();
    for (const e of convertedEnquiries) {
      if (e.assignedToId) {
        const diffHours = (e.updatedAt.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60);
        if (diffHours >= 0) {
          const list = conversionDurationsByUser.get(e.assignedToId) || [];
          list.push(diffHours);
          conversionDurationsByUser.set(e.assignedToId, list);
        }
      }
    }

    const metrics: UserPerformanceMetrics[] = targetUsers.map((user) => {
      const enquiriesAssigned = assignedMap.get(user.id) || 0;
      const contacted = contactedMap.get(user.id) || 0;
      const followupsCompleted = followupsCompletedMap.get(user.id) || 0;
      const followupsMissed = followupsMissedMap.get(user.id) || 0;
      const quotationsSent = quotationsSentMap.get(user.id) || 0;
      const converted = convertedMap.get(user.id) || 0;
      const lost = lostMap.get(user.id) || 0;

      const conversionRate =
        enquiriesAssigned > 0
          ? Number(((converted / enquiriesAssigned) * 100).toFixed(2))
          : 0;

      const contactDurations = contactDurationsByUser.get(user.id) || [];
      const avgTimeToFirstContactHours =
        contactDurations.length > 0
          ? Number((contactDurations.reduce((a, b) => a + b, 0) / contactDurations.length).toFixed(2))
          : null;

      const conversionDurations = conversionDurationsByUser.get(user.id) || [];
      const avgTimeToConversionHours =
        conversionDurations.length > 0
          ? Number((conversionDurations.reduce((a, b) => a + b, 0) / conversionDurations.length).toFixed(2))
          : null;

      return {
        user,
        enquiriesAssigned,
        contacted,
        followupsCompleted,
        followupsMissed,
        quotationsSent,
        converted,
        lost,
        conversionRate,
        avgTimeToFirstContactHours,
        avgTimeToConversionHours,
      };
    });

    return {
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      metrics,
    };
  }
}

export const reportService = new ReportService();
