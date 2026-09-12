import {
  Prisma,
  FollowupStatus,
  FollowupFrequency,
  ActivityType,
  Role,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import {
  canAccessEnquiry,
  canAccessCustomer,
  getSubordinateUserIds,
  isHierarchicalManager,
} from './enquiry.access.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../utils/errors.js';
import { settingsService } from './settings.service.js';

export interface CreateFollowupInput {
  enquiryId?: string | null;
  customerId?: string | null;
  dueAt: string | Date;
  purpose?: string | null;
  frequency?: FollowupFrequency;
  assignedToId?: string | null;
}

export interface ListFollowupsQuery {
  page?: number;
  limit?: number;
  status?: FollowupStatus;
  dueBefore?: string;
  dueAfter?: string;
  enquiryId?: string;
  customerId?: string;
  assignedToId?: string;
}

export class FollowupService {
  /**
   * Schedule a new Follow-up (Part A.1)
   */
  public async createFollowup(
    user: AuthUserPayload,
    input: CreateFollowupInput,
  ) {
    const dueDate = new Date(input.dueAt);
    const skewTolerance = new Date(Date.now() - 5 * 60 * 1000);
    if (isNaN(dueDate.getTime()) || dueDate < skewTolerance) {
      throw new BadRequestError('Due date & time must be in the future (or current time).');
    }

    // Determine target assignee
    let targetAssigneeId = user.userId;

    if (input.assignedToId && input.assignedToId.trim() !== '') {
      const requestedId = input.assignedToId.trim();

      if (user.role === Role.EMPLOYEE && requestedId !== user.userId) {
        throw new ForbiddenError('Employees can only assign follow-ups to themselves.');
      }

      if (isHierarchicalManager(user.role)) {
        const subordinates = await getSubordinateUserIds(user.userId);
        const allowedIds = [user.userId, ...subordinates];
        if (!allowedIds.includes(requestedId)) {
          throw new ForbiddenError(
            'Managers can only assign follow-ups to themselves or their subordinates.',
          );
        }
      }

      const assignee = await prisma.user.findUnique({
        where: { id: requestedId },
      });
      if (!assignee || !assignee.isActive) {
        throw new BadRequestError('Assigned user does not exist or is inactive.');
      }

      targetAssigneeId = requestedId;
    }

    // Resolve and validate customer & enquiry
    let targetCustomerId = input.customerId?.trim() || null;

    if (input.enquiryId && input.enquiryId.trim() !== '') {
      const enquiryId = input.enquiryId.trim();
      const hasEnquiryAccess = await canAccessEnquiry(user, enquiryId);
      if (!hasEnquiryAccess) {
        throw new NotFoundError('Enquiry not found');
      }

      const enquiry = await prisma.enquiry.findUnique({
        where: { id: enquiryId },
        select: { customerId: true },
      });
      if (!enquiry) {
        throw new NotFoundError('Enquiry not found');
      }

      targetCustomerId = enquiry.customerId;
    } else if (targetCustomerId) {
      const hasCustomerAccess = await canAccessCustomer(user, targetCustomerId);
      if (!hasCustomerAccess) {
        throw new NotFoundError('Customer not found');
      }
    } else {
      throw new BadRequestError('Exactly one of enquiryId or customerId is required.');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Create Followup
      const followup = await tx.followup.create({
        data: {
          enquiryId: input.enquiryId?.trim() || null,
          customerId: targetCustomerId,
          assignedToId: targetAssigneeId,
          dueAt: dueDate,
          purpose: input.purpose?.trim() || null,
          frequency: input.frequency || FollowupFrequency.ONE_TIME,
          status: FollowupStatus.PENDING,
        },
        include: {
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
          customer: true,
          enquiry: true,
        },
      });

      // 2. Activity row (type: FOLLOW_UP_SCHEDULED) if enquiry-linked
      if (input.enquiryId && input.enquiryId.trim() !== '') {
        await tx.activity.create({
          data: {
            enquiryId: input.enquiryId.trim(),
            userId: user.userId,
            type: ActivityType.FOLLOW_UP_SCHEDULED,
            description: input.purpose?.trim() || 'Follow-up scheduled',
            nextFollowupAt: dueDate,
          },
        });
      }

      return followup;
    });
  }

  /**
   * List follow-ups scoped by hierarchical role (Part A.2)
   */
  public async listFollowups(
    user: AuthUserPayload,
    query: ListFollowupsQuery,
  ) {
    const conditions: Prisma.FollowupWhereInput[] = [];

    // Role-based hierarchy scoping
    if (user.role === Role.ADMIN) {
      if (query.assignedToId) {
        conditions.push({ assignedToId: query.assignedToId });
      }
    } else if (isHierarchicalManager(user.role)) {
      const subordinates = await getSubordinateUserIds(user.userId);
      const allowedIds = [user.userId, ...subordinates];

      if (query.assignedToId) {
        if (!allowedIds.includes(query.assignedToId)) {
          return {
            followups: [],
            meta: { total: 0, page: 1, limit: query.limit || 10, totalPages: 0 },
          };
        }
        conditions.push({ assignedToId: query.assignedToId });
      } else {
        conditions.push({ assignedToId: { in: allowedIds } });
      }
    } else {
      // EMPLOYEE: strictly own follow-ups
      conditions.push({ assignedToId: user.userId });
    }

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.enquiryId) {
      conditions.push({ enquiryId: query.enquiryId });
    }

    if (query.customerId) {
      conditions.push({ customerId: query.customerId });
    }

    if (query.dueBefore) {
      const before = new Date(query.dueBefore);
      if (!isNaN(before.getTime())) {
        conditions.push({ dueAt: { lte: before } });
      }
    }

    if (query.dueAfter) {
      const after = new Date(query.dueAfter);
      if (!isNaN(after.getTime())) {
        conditions.push({ dueAt: { gte: after } });
      }
    }

    const where: Prisma.FollowupWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, followups] = await Promise.all([
      prisma.followup.count({ where }),
      prisma.followup.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueAt: 'asc' },
        include: {
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
          customer: true,
          enquiry: true,
        },
      }),
    ]);

    return {
      followups,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Complete a follow-up and schedule recurrence if applicable (Part A.3)
   */
  public async completeFollowup(
    user: AuthUserPayload,
    followupId: string,
  ) {
    const followup = await prisma.followup.findUnique({
      where: { id: followupId },
      include: {
        assignedTo: true,
        customer: true,
        enquiry: true,
      },
    });

    if (!followup) {
      throw new NotFoundError('Follow-up not found');
    }

    // Authorization check: Only assigned user or Manager+ in their hierarchy can complete
    let canComplete = false;
    if (user.role === Role.ADMIN || followup.assignedToId === user.userId) {
      canComplete = true;
    } else if (isHierarchicalManager(user.role)) {
      const subordinates = await getSubordinateUserIds(user.userId);
      canComplete = subordinates.includes(followup.assignedToId);
    }

    if (!canComplete) {
      throw new ForbiddenError(
        'You do not have authorization to complete this follow-up.',
      );
    }

    if (followup.status === FollowupStatus.COMPLETED) {
      throw new BadRequestError('This follow-up has already been completed.');
    }

    // Calculate next due date if recurring
    let nextDueAt: Date | null = null;
    if (followup.frequency !== FollowupFrequency.ONE_TIME) {
      const baseDate = new Date();
      switch (followup.frequency) {
        case FollowupFrequency.DAILY:
          nextDueAt = new Date(baseDate.getTime() + 1 * 24 * 60 * 60 * 1000);
          break;
        case FollowupFrequency.WEEKLY:
          nextDueAt = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case FollowupFrequency.MONTHLY: {
          const next = new Date(baseDate);
          next.setMonth(next.getMonth() + 1);
          nextDueAt = next;
          break;
        }
        case FollowupFrequency.QUARTERLY: {
          const next = new Date(baseDate);
          next.setMonth(next.getMonth() + 3);
          nextDueAt = next;
          break;
        }
        case FollowupFrequency.CUSTOM:
          nextDueAt = new Date(baseDate.getTime() + 1 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Mark completed
      const updated = await tx.followup.update({
        where: { id: followupId },
        data: {
          status: FollowupStatus.COMPLETED,
          completedAt: new Date(),
        },
        include: {
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
          customer: true,
          enquiry: true,
        },
      });

      // 2. If recurring, create next Followup record
      let nextFollowup = null;
      if (nextDueAt) {
        nextFollowup = await tx.followup.create({
          data: {
            enquiryId: followup.enquiryId,
            customerId: followup.customerId,
            assignedToId: followup.assignedToId,
            dueAt: nextDueAt,
            purpose: followup.purpose,
            frequency: followup.frequency,
            status: FollowupStatus.PENDING,
          },
          include: {
            assignedTo: { select: { id: true, name: true, email: true, role: true } },
            customer: true,
          },
        });
      }

      // 3. Write Activity row if enquiry-linked
      if (followup.enquiryId) {
        await tx.activity.create({
          data: {
            enquiryId: followup.enquiryId,
            userId: user.userId,
            type: ActivityType.FOLLOW_UP_COMPLETED,
            description: `Follow-up completed${followup.purpose ? ': ' + followup.purpose : ''}${nextDueAt ? ' (Next occurrence scheduled)' : ''}`,
            nextFollowupAt: nextDueAt,
          },
        });
      }

      return {
        completed: updated,
        followup: updated,
        nextFollowup,
      };
    });
  }

  /**
   * Reassign a SINGLE follow-up's assignedToId to another user (Part B)
   * Does NOT modify parent enquiry.assignedToId.
   */
  public async reassignFollowup(
    user: AuthUserPayload,
    followupId: string,
    targetUserId: string,
  ) {
    const followup = await prisma.followup.findUnique({
      where: { id: followupId },
      include: {
        assignedTo: true,
        enquiry: true,
        customer: true,
      },
    });

    if (!followup) {
      throw new NotFoundError('Follow-up not found');
    }

    const cleanTargetId = targetUserId.trim();
    if (cleanTargetId === followup.assignedToId) {
      throw new BadRequestError('Follow-up is already assigned to this user');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: cleanTargetId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new BadRequestError('Target user does not exist or is inactive');
    }

    // Permission Verification:
    if (user.role === Role.ADMIN) {
      // Admin is unrestricted
    } else if (isHierarchicalManager(user.role)) {
      // Manager/AGM/DGM: must manage current assignee AND target assignee must be within caller's subordinate tree
      const subordinates = await getSubordinateUserIds(user.userId);
      const allowedIds = [user.userId, ...subordinates];

      if (!allowedIds.includes(followup.assignedToId)) {
        throw new ForbiddenError(
          'You can only reassign follow-ups assigned to yourself or your subordinates.',
        );
      }

      if (!allowedIds.includes(cleanTargetId)) {
        throw new ForbiddenError(
          'Managers can only reassign follow-ups to themselves or their subordinates.',
        );
      }
    } else {
      // Employee / assignee caller:
      // Must be the follow-up's current assignee
      if (followup.assignedToId !== user.userId) {
        throw new ForbiddenError(
          'Employees can only reassign follow-ups currently assigned to them.',
        );
      }

      // Anti-backdoor verification:
      // Target user must already have access to the parent entity
      if (followup.enquiryId && followup.enquiry) {
        const isParentEnquiryAssignee = followup.enquiry.assignedToId === cleanTargetId;
        const settings = await settingsService.getSettings();
        const isValidForwardTarget =
          settings.allowEmployeeReassignment && targetUser.role === Role.EMPLOYEE;

        if (!isParentEnquiryAssignee && !isValidForwardTarget) {
          throw new ForbiddenError(
            'Target user does not have access to the parent enquiry.',
          );
        }
      } else if (followup.customerId) {
        // Customer-only follow-up
        const targetUserPayload: AuthUserPayload = {
          userId: targetUser.id,
          role: targetUser.role,
        };
        const hasCustomerAccess = await canAccessCustomer(targetUserPayload, followup.customerId);
        if (!hasCustomerAccess) {
          throw new ForbiddenError(
            'Target user does not have access to the customer.',
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Update follow-up assignee
      const updated = await tx.followup.update({
        where: { id: followupId },
        data: { assignedToId: cleanTargetId },
        include: {
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
          customer: true,
          enquiry: true,
        },
      });

      // 2. Activity row on parent enquiry if enquiry-linked
      if (followup.enquiryId) {
        const prevAssigneeName = followup.assignedTo?.name || 'Previous assignee';
        await tx.activity.create({
          data: {
            enquiryId: followup.enquiryId,
            userId: user.userId,
            type: ActivityType.FOLLOW_UP_SCHEDULED,
            description: `Follow-up reassigned from ${prevAssigneeName} to ${targetUser.name}${followup.purpose ? ' (' + followup.purpose + ')' : ''}`,
            nextFollowupAt: followup.dueAt,
          },
        });
      }

      // 3. AuditLog entry
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'ASSIGN',
          entityType: 'Followup',
          entityId: followupId,
          metadata: {
            previousAssigneeId: followup.assignedToId,
            newAssigneeId: cleanTargetId,
            enquiryId: followup.enquiryId,
            customerId: followup.customerId,
          },
        },
      });

      return updated;
    });
  }
}

export const followupService = new FollowupService();
