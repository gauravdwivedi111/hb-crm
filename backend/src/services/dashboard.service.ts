import {
  Prisma,
  Role,
  EnquiryStatus,
  FollowupStatus,
  QuotationStatus,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import {
  buildEnquiryAccessFilter,
  getSubordinateUserIds,
  isManagerPlus,
} from './enquiry.access.js';
import { ForbiddenError } from '../utils/errors.js';
import {
  getTimezoneDayBoundaries,
  getTimezoneMonthBoundaries,
} from '../utils/date.js';

export interface StatusCounts {
  [EnquiryStatus.NEW]: number;
  [EnquiryStatus.ASSIGNED]: number;
  [EnquiryStatus.CONTACTED]: number;
  [EnquiryStatus.FOLLOW_UP_REQUIRED]: number;
  [EnquiryStatus.QUOTATION_SENT]: number;
  [EnquiryStatus.NEGOTIATION]: number;
  [EnquiryStatus.CONVERTED]: number;
  [EnquiryStatus.LOST]: number;
  [EnquiryStatus.ON_HOLD]: number;
}

export interface SubordinateMetrics {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  countsByStatus: StatusCounts;
  followups: {
    dueToday: number;
    overdue: number;
  };
  quotationsPendingResponse: number;
  assignedCount: number;
  contactedCount: number;
  overdueCount: number;
  convertedThisMonth: number;
  lostThisMonth: number;
  conversionRateThisMonth: number;
}

export function createInitialStatusCounts(): StatusCounts {
  return {
    [EnquiryStatus.NEW]: 0,
    [EnquiryStatus.ASSIGNED]: 0,
    [EnquiryStatus.CONTACTED]: 0,
    [EnquiryStatus.FOLLOW_UP_REQUIRED]: 0,
    [EnquiryStatus.QUOTATION_SENT]: 0,
    [EnquiryStatus.NEGOTIATION]: 0,
    [EnquiryStatus.CONVERTED]: 0,
    [EnquiryStatus.LOST]: 0,
    [EnquiryStatus.ON_HOLD]: 0,
  };
}

export class DashboardService {
  /**
   * GET /dashboard/me
   * Resolves caller's personal or hierarchically scoped dashboard.
   */
  public async getMyDashboard(user: AuthUserPayload) {
    const now = new Date();
    const { startOfDay, endOfDay } = getTimezoneDayBoundaries(now);
    const { startOfMonth, endOfMonth } = getTimezoneMonthBoundaries(now);

    const enquiryScope = await buildEnquiryAccessFilter(user);

    // 1. Counts by enquiry status
    const statusGroups = await prisma.enquiry.groupBy({
      by: ['status'],
      where: enquiryScope,
      _count: { id: true },
    });

    const countsByStatus = createInitialStatusCounts();
    for (const group of statusGroups) {
      countsByStatus[group.status] = group._count.id;
    }

    // 2. Follow-ups scoping
    let followupScope: Prisma.FollowupWhereInput = {};
    if (user.role === Role.EMPLOYEE) {
      followupScope = { assignedToId: user.userId };
    } else if (isManagerPlus(user.role)) {
      if (user.role !== Role.ADMIN) {
        const subordinateIds = await getSubordinateUserIds(user.userId);
        followupScope = {
          assignedToId: { in: [user.userId, ...subordinateIds] },
        };
      }
    }

    const [dueToday, overdueCount] = await Promise.all([
      prisma.followup.count({
        where: {
          ...followupScope,
          status: FollowupStatus.PENDING,
          dueAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.followup.count({
        where: {
          ...followupScope,
          OR: [
            { status: FollowupStatus.OVERDUE },
            {
              status: FollowupStatus.PENDING,
              dueAt: { lt: now },
            },
          ],
        },
      }),
    ]);

    // 3. Quotations pending response (SENT or VIEWED with no respondedAt)
    const quotationsPendingResponse = await prisma.quotation.count({
      where: {
        status: { in: [QuotationStatus.SENT, QuotationStatus.VIEWED] },
        respondedAt: null,
        enquiry: enquiryScope,
      },
    });

    // 4. Converted count and Lost count this month
    const [convertedThisMonth, lostThisMonth] = await Promise.all([
      prisma.enquiry.count({
        where: {
          ...enquiryScope,
          status: EnquiryStatus.CONVERTED,
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      prisma.enquiry.count({
        where: {
          ...enquiryScope,
          status: EnquiryStatus.LOST,
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
    ]);

    // 5. Recently contacted customers (last 5, by lastContactedAt)
    const recentEnquiries = await prisma.enquiry.findMany({
      where: {
        ...enquiryScope,
        lastContactedAt: { not: null },
      },
      orderBy: { lastContactedAt: 'desc' },
      take: 5,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    const recentlyContactedCustomers = recentEnquiries.map((e) => ({
      customerId: e.customer.id,
      customerName: e.customer.name,
      companyName: e.companyName || e.customer.companyName,
      phone: e.phone,
      email: e.email,
      lastContactedAt: e.lastContactedAt,
      enquiryId: e.id,
      product: e.product,
    }));

    return {
      countsByStatus,
      followups: {
        dueToday,
        overdue: overdueCount,
      },
      quotationsPendingResponse,
      performanceThisMonth: {
        converted: convertedThisMonth,
        lost: lostThisMonth,
      },
      recentlyContactedCustomers,
    };
  }

  /**
   * Compute comprehensive team metrics across a given set of user accounts.
   */
  public async getTeamMetricsForMembers(
    teamMembers: Array<{ id: string; name: string; email: string; role: Role }>,
  ): Promise<SubordinateMetrics[]> {
    if (teamMembers.length === 0) {
      return [];
    }

    const now = new Date();
    const { startOfDay, endOfDay } = getTimezoneDayBoundaries(now);
    const { startOfMonth, endOfMonth } = getTimezoneMonthBoundaries(now);
    const memberIds = teamMembers.map((m) => m.id);

    // Optimized batch aggregations across all team members
    const [
      enquiryStatusGroups,
      enquiryTotalAssigned,
      enquiryTotalAssignedThisMonth,
      enquiriesContacted,
      enquiriesConvertedMonth,
      enquiriesLostMonth,
      followupsDueTodayGroups,
      followupsOverdueGroups,
      pendingQuotationsGroups,
    ] = await Promise.all([
      // Status breakdown per user
      prisma.enquiry.groupBy({
        by: ['assignedToId', 'status'],
        where: { assignedToId: { in: memberIds } },
        _count: { id: true },
      }),
      // Total assigned enquiries
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { in: memberIds } },
        _count: { id: true },
      }),
      // Assigned this month
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _count: { id: true },
      }),
      // Contacted count (lastContactedAt != null)
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
          lastContactedAt: { not: null },
        },
        _count: { id: true },
      }),
      // Converted this month
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
          status: EnquiryStatus.CONVERTED,
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _count: { id: true },
      }),
      // Lost this month
      prisma.enquiry.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
          status: EnquiryStatus.LOST,
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _count: { id: true },
      }),
      // Follow-ups due today
      prisma.followup.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
          status: FollowupStatus.PENDING,
          dueAt: { gte: startOfDay, lte: endOfDay },
        },
        _count: { id: true },
      }),
      // Follow-ups overdue
      prisma.followup.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
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
      // Quotations pending response
      prisma.quotation.groupBy({
        by: ['createdById'],
        where: {
          createdById: { in: memberIds },
          status: { in: [QuotationStatus.SENT, QuotationStatus.VIEWED] },
          respondedAt: null,
        },
        _count: { id: true },
      }),
    ]);

    // Map lookups for O(1) assembly
    const statusByMember = new Map<string, StatusCounts>();
    for (const id of memberIds) {
      statusByMember.set(id, createInitialStatusCounts());
    }
    for (const group of enquiryStatusGroups) {
      if (group.assignedToId && statusByMember.has(group.assignedToId)) {
        statusByMember.get(group.assignedToId)![group.status] = group._count.id;
      }
    }

    const assignedTotalMap = new Map(enquiryTotalAssigned.map((g) => [g.assignedToId, g._count.id]));
    const assignedMonthMap = new Map(enquiryTotalAssignedThisMonth.map((g) => [g.assignedToId, g._count.id]));
    const contactedMap = new Map(enquiriesContacted.map((g) => [g.assignedToId, g._count.id]));
    const convertedMonthMap = new Map(enquiriesConvertedMonth.map((g) => [g.assignedToId, g._count.id]));
    const lostMonthMap = new Map(enquiriesLostMonth.map((g) => [g.assignedToId, g._count.id]));
    const dueTodayMap = new Map(followupsDueTodayGroups.map((g) => [g.assignedToId, g._count.id]));
    const overdueMap = new Map(followupsOverdueGroups.map((g) => [g.assignedToId, g._count.id]));
    const pendingQuotesMap = new Map(pendingQuotationsGroups.map((g) => [g.createdById, g._count.id]));

    return teamMembers.map((member) => {
      const assignedCount = assignedTotalMap.get(member.id) || 0;
      const assignedThisMonth = assignedMonthMap.get(member.id) || 0;
      const contactedCount = contactedMap.get(member.id) || 0;
      const convertedThisMonth = convertedMonthMap.get(member.id) || 0;
      const lostThisMonth = lostMonthMap.get(member.id) || 0;
      const dueToday = dueTodayMap.get(member.id) || 0;
      const overdue = overdueMap.get(member.id) || 0;
      const quotationsPending = pendingQuotesMap.get(member.id) || 0;

      const conversionRateThisMonth =
        assignedThisMonth > 0
          ? Number(((convertedThisMonth / assignedThisMonth) * 100).toFixed(2))
          : 0;

      return {
        user: member,
        countsByStatus: statusByMember.get(member.id) || createInitialStatusCounts(),
        followups: {
          dueToday,
          overdue,
        },
        quotationsPendingResponse: quotationsPending,
        assignedCount,
        contactedCount,
        overdueCount: overdue,
        convertedThisMonth,
        lostThisMonth,
        conversionRateThisMonth,
      };
    });
  }

  /**
   * Retrieve team metrics for a specific manager and their subordinate tree.
   */
  public async getTeamDashboardForManager(managerUserId: string): Promise<SubordinateMetrics[]> {
    const subordinateIds = await getSubordinateUserIds(managerUserId);
    const teamMembers = await prisma.user.findMany({
      where: {
        id: { in: [managerUserId, ...subordinateIds] },
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });

    return this.getTeamMetricsForMembers(teamMembers);
  }

  /**
   * GET /dashboard/team
   * Manager+ only: returns metrics broken down per subordinate in their tree.
   * If caller is Admin and managerId is provided, returns metrics for that manager's team.
   */
  public async getTeamDashboard(user: AuthUserPayload, managerId?: string) {
    if (!isManagerPlus(user.role)) {
      throw new ForbiddenError('Only managers and administrators can access the team dashboard.');
    }

    if (user.role === Role.ADMIN && managerId && managerId.trim() !== '') {
      const team = await this.getTeamDashboardForManager(managerId.trim());
      return { team };
    }

    // Identify subordinate users
    let teamMembers: Array<{ id: string; name: string; email: string; role: Role }>;

    if (user.role === Role.ADMIN) {
      teamMembers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      });
    } else {
      const subordinateIds = await getSubordinateUserIds(user.userId);
      teamMembers = await prisma.user.findMany({
        where: {
          id: { in: [user.userId, ...subordinateIds] },
          isActive: true,
        },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      });
    }

    const team = await this.getTeamMetricsForMembers(teamMembers);
    return { team };
  }
}

export const dashboardService = new DashboardService();
