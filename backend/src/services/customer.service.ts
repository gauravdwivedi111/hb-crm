import { Prisma, Role } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import {
  canAccessCustomer,
  buildCustomerAccessFilter,
  getSubordinateUserIds,
  isHierarchicalManager,
} from './enquiry.access.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../utils/errors.js';

export interface CreateCustomerInput {
  name: string;
  companyName?: string | null;
  phone: string;
  email?: string | null;
  location?: string | null;
  notes?: string | null;
  assignedToId?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  companyName?: string | null;
  phone?: string;
  email?: string | null;
  location?: string | null;
  notes?: string | null;
  assignedToId?: string | null;
}

export interface ListCustomersQuery {
  page?: number;
  limit?: number;
  search?: string;
  assignedToId?: string;
}

export class CustomerService {
  /**
   * Creates a new customer.
   * Any authenticated user can create.
   * assignedToId defaults to caller; Manager+ can assign to subordinates.
   */
  public async createCustomer(
    user: AuthUserPayload,
    input: CreateCustomerInput,
  ) {
    let targetAssigneeId: string | null = user.userId;

    if (input.assignedToId !== undefined && input.assignedToId !== null && input.assignedToId.trim() !== '') {
      const requestedId = input.assignedToId.trim();

      if (user.role === Role.EMPLOYEE && requestedId !== user.userId) {
        throw new ForbiddenError('Employees can only assign customers to themselves.');
      }

      if (isHierarchicalManager(user.role)) {
        const subordinates = await getSubordinateUserIds(user.userId);
        const allowedIds = [user.userId, ...subordinates];
        if (!allowedIds.includes(requestedId)) {
          throw new ForbiddenError('Managers can only assign customers to themselves or their subordinates.');
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

    const customer = await prisma.customer.create({
      data: {
        name: input.name.trim(),
        companyName: input.companyName ? input.companyName.trim() : null,
        phone: input.phone.trim(),
        email: input.email ? input.email.trim().toLowerCase() : null,
        location: input.location ? input.location.trim() : null,
        notes: input.notes ? input.notes.trim() : null,
        assignedToId: targetAssigneeId,
      },
    });

    return customer;
  }

  /**
   * Lists customers scoped to the user's role and hierarchy:
   * - EMPLOYEE: own customers only
   * - MANAGER+: own + subordinates + unassigned
   * - ADMIN: all customers
   */
  public async listCustomers(user: AuthUserPayload, query: ListCustomersQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const accessFilter = await buildCustomerAccessFilter(user, query.assignedToId);

    const where: Prisma.CustomerWhereInput = { ...accessFilter };

    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      where.AND = [
        accessFilter,
        {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { companyName: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      customers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves a customer by ID.
   * Anti-enumeration: returns 404 if not found or unauthorized.
   * Includes linked enquiries, recent followups, and attachments.
   */
  public async getCustomerById(user: AuthUserPayload, customerId: string) {
    const hasAccess = await canAccessCustomer(user, customerId);
    if (!hasAccess) {
      throw new NotFoundError('Customer not found');
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        enquiries: {
          orderBy: { createdAt: 'desc' },
        },
        followups: {
          orderBy: { dueAt: 'desc' },
          take: 10,
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            createdAt: true,
            uploadedById: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer;
  }

  /**
   * Updates an existing customer's contact fields and/or assignment.
   * Anti-enumeration: returns 404 if not found or unauthorized.
   */
  public async updateCustomer(
    user: AuthUserPayload,
    customerId: string,
    data: UpdateCustomerInput,
  ) {
    const hasAccess = await canAccessCustomer(user, customerId);
    if (!hasAccess) {
      throw new NotFoundError('Customer not found');
    }

    const updateData: Prisma.CustomerUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.companyName !== undefined) {
      updateData.companyName = data.companyName ? data.companyName.trim() : null;
    }
    if (data.phone !== undefined) updateData.phone = data.phone.trim();
    if (data.email !== undefined) {
      updateData.email = data.email ? data.email.trim().toLowerCase() : null;
    }
    if (data.location !== undefined) {
      updateData.location = data.location ? data.location.trim() : null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes ? data.notes.trim() : null;
    }

    if (data.assignedToId !== undefined) {
      if (data.assignedToId === null || data.assignedToId.trim() === '') {
        if (user.role === Role.EMPLOYEE) {
          throw new ForbiddenError('Employees cannot unassign customers.');
        }
        updateData.assignedToId = null;
      } else {
        const requestedId = data.assignedToId.trim();
        if (user.role === Role.EMPLOYEE && requestedId !== user.userId) {
          throw new ForbiddenError('Employees can only assign customers to themselves.');
        }

        if (isHierarchicalManager(user.role)) {
          const subordinates = await getSubordinateUserIds(user.userId);
          const allowedIds = [user.userId, ...subordinates];
          if (!allowedIds.includes(requestedId)) {
            throw new ForbiddenError('Managers can only assign customers to themselves or their subordinates.');
          }
        }

        const assignee = await prisma.user.findUnique({
          where: { id: requestedId },
        });
        if (!assignee || !assignee.isActive) {
          throw new BadRequestError('Assigned user does not exist or is inactive.');
        }

        updateData.assignedToId = requestedId;
      }
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: updateData,
    });

    return updated;
  }
}

export const customerService = new CustomerService();
