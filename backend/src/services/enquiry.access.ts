import { Role, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';

export const isManagerPlus = (role: Role): boolean => {
  return (
    role === Role.ADMIN ||
    role === Role.MANAGER ||
    role === Role.AGM ||
    role === Role.DGM
  );
};

export const isHierarchicalManager = (role: Role): boolean => {
  return role === Role.MANAGER || role === Role.AGM || role === Role.DGM;
};

/**
 * Traverses the supervisory hierarchy (User.supervisorId) to gather
 * all active direct and indirect subordinates for a given user.
 */
export async function getSubordinateUserIds(userId: string): Promise<string[]> {
  const allSubordinates: string[] = [];
  let currentLevel = [userId];

  while (currentLevel.length > 0) {
    const nextLevelUsers = await prisma.user.findMany({
      where: {
        supervisorId: { in: currentLevel },
        isActive: true,
      },
      select: { id: true },
    });

    const nextLevelIds = nextLevelUsers.map((u) => u.id);
    if (nextLevelIds.length === 0) {
      break;
    }

    allSubordinates.push(...nextLevelIds);
    currentLevel = nextLevelIds;
  }

  return allSubordinates;
}

/**
 * Checks whether a user has permission to view/update a specific enquiry.
 * Returns false if enquiry does not exist or user lacks authorization.
 */
export async function canAccessEnquiry(
  user: AuthUserPayload,
  enquiryId: string,
): Promise<boolean> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, assignedToId: true, createdById: true },
  });

  if (!enquiry) {
    return false;
  }

  // Admin has unrestricted access
  if (user.role === Role.ADMIN) {
    return true;
  }

  // Creator can always access their own enquiry
  if (enquiry.createdById === user.userId) {
    return true;
  }

  // Employee: can strictly only access enquiries assigned to themselves
  if (user.role === Role.EMPLOYEE) {
    return enquiry.assignedToId === user.userId;
  }

  // Manager/AGM/DGM: can access unassigned enquiries, their own, or subordinate enquiries
  if (isHierarchicalManager(user.role)) {
    if (enquiry.assignedToId === user.userId || enquiry.assignedToId === null) {
      return true;
    }

    const subordinateIds = await getSubordinateUserIds(user.userId);
    return subordinateIds.includes(enquiry.assignedToId);
  }

  return false;
}

/**
 * Generates a Prisma where filter enforcing access scoping for enquiry queries.
 */
export async function buildEnquiryAccessFilter(
  user: AuthUserPayload,
  requestedAssignedToId?: string,
): Promise<Prisma.EnquiryWhereInput> {
  // Admin: full access with optional filter
  if (user.role === Role.ADMIN) {
    if (requestedAssignedToId) {
      return { assignedToId: requestedAssignedToId };
    }
    return {};
  }

  // Employee: strictly their own assigned enquiries OR enquiries they created
  if (user.role === Role.EMPLOYEE) {
    return {
      OR: [
        { assignedToId: user.userId },
        { createdById: user.userId },
      ],
    };
  }

  // Manager / AGM / DGM
  if (isHierarchicalManager(user.role)) {
    const subordinateIds = await getSubordinateUserIds(user.userId);
    const allowedAssigneeIds = [user.userId, ...subordinateIds];

    if (requestedAssignedToId) {
      // If requested user is outside the manager's hierarchy, return impossible match
      if (!allowedAssigneeIds.includes(requestedAssignedToId)) {
        return { id: '__UNAUTHORIZED_FILTER__' };
      }
      return { assignedToId: requestedAssignedToId };
    }

    // Default: manager's own + all subordinate enquiries + unassigned enquiries
    return {
      OR: [
        { assignedToId: { in: allowedAssigneeIds } },
        { assignedToId: null },
      ],
    };
  }

  // Fallback: deny all
  return { id: '__DENIED__' };
}

/**
 * Checks whether a user has permission to view/interact with a specific customer.
 * Enforces the same hierarchical scoping rules as enquiries:
 * - Admin: full access
 * - Employee: only customers assigned to caller
 * - Manager+: caller's own + subordinate tree + unassigned customers
 */
export async function canAccessCustomer(
  user: AuthUserPayload,
  customerId: string,
): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, assignedToId: true },
  });

  if (!customer) {
    return false;
  }

  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role === Role.EMPLOYEE) {
    return customer.assignedToId === user.userId;
  }

  if (isHierarchicalManager(user.role)) {
    if (customer.assignedToId === user.userId || customer.assignedToId === null) {
      return true;
    }

    const subordinateIds = await getSubordinateUserIds(user.userId);
    return subordinateIds.includes(customer.assignedToId);
  }

  return false;
}

/**
 * Generates a Prisma where filter enforcing access scoping for customer queries.
 */
export async function buildCustomerAccessFilter(
  user: AuthUserPayload,
  requestedAssignedToId?: string,
): Promise<Prisma.CustomerWhereInput> {
  if (user.role === Role.ADMIN) {
    if (requestedAssignedToId) {
      return { assignedToId: requestedAssignedToId };
    }
    return {};
  }

  if (user.role === Role.EMPLOYEE) {
    return { assignedToId: user.userId };
  }

  if (isHierarchicalManager(user.role)) {
    const subordinateIds = await getSubordinateUserIds(user.userId);
    const allowedAssigneeIds = [user.userId, ...subordinateIds];

    if (requestedAssignedToId) {
      if (!allowedAssigneeIds.includes(requestedAssignedToId)) {
        return { id: '__UNAUTHORIZED_FILTER__' };
      }
      return { assignedToId: requestedAssignedToId };
    }

    return {
      OR: [
        { assignedToId: { in: allowedAssigneeIds } },
        { assignedToId: null },
      ],
    };
  }

  return { id: '__DENIED__' };
}

