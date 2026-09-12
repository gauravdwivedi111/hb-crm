import {
  Prisma,
  EnquiryStatus,
  Priority,
  ActivityType,
  Enquiry,
  Role,
} from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import {
  canAccessEnquiry,
  buildEnquiryAccessFilter,
  isManagerPlus,
} from './enquiry.access.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../utils/errors.js';
import { emailService } from './email.service.js';
import { settingsService } from './settings.service.js';

export interface InlineCustomerInput {
  name: string;
  phone: string;
  email?: string | null;
  companyName?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface CreateEnquiryInput {
  customerId?: string;
  customer?: InlineCustomerInput;
  companyName?: string;
  phone: string;
  email?: string;
  location?: string;
  source?: string;
  product?: string;
  priority?: Priority;
  expectedValue?: number | string | Prisma.Decimal;
  remarks?: string;
  assignedToId?: string;
}

export interface ListEnquiriesQuery {
  page?: number;
  limit?: number;
  status?: EnquiryStatus;
  priority?: Priority;
  assignedToId?: string;
  search?: string;
}

export interface UpdateEnquiryInput {
  phone?: string;
  email?: string;
  location?: string;
  source?: string;
  product?: string;
  priority?: Priority;
  expectedValue?: number | string | Prisma.Decimal;
  remarks?: string;
}

export interface ChangeStatusInput {
  newStatus: EnquiryStatus;
  reason?: string;
}

export class EnquiryService {
  /**
   * Create an Enquiry with atomic Activity, StatusHistory, and AuditLog entries.
   */
  public async createEnquiry(
    user: AuthUserPayload,
    input: CreateEnquiryInput,
  ): Promise<Enquiry> {
    // Role rule: Only Manager+ can set assignedToId on creation
    if (input.assignedToId) {
      if (!isManagerPlus(user.role)) {
        throw new ForbiddenError(
          'Employees cannot assign enquiries at creation. Only Managers and Admins may specify an assignee.',
        );
      }

      const assignedUser = await prisma.user.findUnique({
        where: { id: input.assignedToId },
      });
      if (!assignedUser || !assignedUser.isActive) {
        throw new BadRequestError('Specified assignee is invalid or inactive.');
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let targetCustomerId = input.customerId;

      // Inline customer creation or resolution
      if (!targetCustomerId && input.customer) {
        const normalizedPhone = input.customer.phone.trim();
        const existingCustomer = await tx.customer.findFirst({
          where: { phone: normalizedPhone },
        });

        if (existingCustomer) {
          targetCustomerId = existingCustomer.id;
        } else {
          const newCustomer = await tx.customer.create({
            data: {
              name: input.customer.name.trim(),
              phone: normalizedPhone,
              email: input.customer.email?.trim().toLowerCase() || null,
              companyName: input.customer.companyName?.trim() || null,
              location: input.customer.location?.trim() || null,
              notes: input.customer.notes?.trim() || null,
            },
          });
          targetCustomerId = newCustomer.id;
        }
      }

      if (!targetCustomerId) {
        throw new BadRequestError(
          'Either customerId or inline customer details (name, phone) must be provided.',
        );
      }

      // Verify existing customer
      const customerExists = await tx.customer.findUnique({
        where: { id: targetCustomerId },
      });
      if (!customerExists) {
        throw new BadRequestError('Referenced customer does not exist.');
      }

      // 1. Create Enquiry
      const enquiry = await tx.enquiry.create({
        data: {
          customerId: targetCustomerId,
          companyName: input.companyName?.trim() || null,
          phone: input.phone.trim(),
          email: input.email?.trim().toLowerCase() || null,
          location: input.location?.trim() || null,
          source: input.source?.trim() || null,
          product: input.product?.trim() || null,
          priority: input.priority || Priority.MEDIUM,
          expectedValue: input.expectedValue != null ? new Prisma.Decimal(input.expectedValue) : null,
          remarks: input.remarks?.trim() || null,
          assignedToId: input.assignedToId || null,
          createdById: user.userId,
          status: EnquiryStatus.NEW,
        },
        include: {
          customer: true,
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // 2. Activity row: type ENQUIRY_ASSIGNED if assignedToId is set
      if (input.assignedToId) {
        await tx.activity.create({
          data: {
            enquiryId: enquiry.id,
            userId: user.userId,
            type: ActivityType.ENQUIRY_ASSIGNED,
            description: `Enquiry created and assigned to ${enquiry.assignedTo?.name || input.assignedToId}`,
          },
        });
      }

      // 3. StatusHistory row: oldStatus null -> NEW
      await tx.statusHistory.create({
        data: {
          enquiryId: enquiry.id,
          oldStatus: null,
          newStatus: EnquiryStatus.NEW,
          changedById: user.userId,
          reason: 'Initial enquiry creation',
        },
      });

      // 4. AuditLog row
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'CREATE',
          entityType: 'Enquiry',
          entityId: enquiry.id,
          metadata: {
            status: EnquiryStatus.NEW,
            assignedToId: enquiry.assignedToId,
            priority: enquiry.priority,
            customerId: enquiry.customerId,
          },
        },
      });

      // 5. Notification row for assignee
      if (input.assignedToId) {
        const leadLabel = enquiry.companyName || enquiry.product || enquiry.customer?.name || 'New Lead';
        await tx.notification.create({
          data: {
            userId: input.assignedToId,
            type: 'ENQUIRY_ASSIGNED',
            message: `New enquiry for "${leadLabel}" has been assigned to you.`,
            relatedEnquiryId: enquiry.id,
            read: false,
          },
        });
      }

      return enquiry;
    });

    // Decoupled email alert for high-signal enquiry assignment
    if (result.assignedToId && result.assignedTo?.email) {
      const targetLabel = result.companyName || result.product || result.customer?.name || 'Lead';
      void emailService.sendEmail(
        result.assignedTo.email,
        `[HB CRM] New Enquiry Assigned: ${targetLabel}`,
        `Hello ${result.assignedTo.name},\n\nYou have been assigned a new enquiry: "${targetLabel}".\n\nPriority: ${result.priority}\n\nPlease log in to HB CRM to review details and begin follow-up:\nhttp://localhost:5173/enquiries/${result.id}\n\nBest regards,\nHB CRM Notifications`,
      ).catch((err) => console.error('[Enquiry] Failed to dispatch creation assignment email:', err));
    }

    return result;
  }

  /**
   * List enquiries scoped by hierarchical access rules.
   */
  public async listEnquiries(
    user: AuthUserPayload,
    query: ListEnquiriesQuery,
  ) {
    const accessFilter = await buildEnquiryAccessFilter(user, query.assignedToId);

    const conditions: Prisma.EnquiryWhereInput[] = [accessFilter];

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.priority) {
      conditions.push({ priority: query.priority });
    }

    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      conditions.push({
        OR: [
          { companyName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { product: { contains: term, mode: 'insensitive' } },
          { customer: { name: { contains: term, mode: 'insensitive' } } },
          { customer: { phone: { contains: term, mode: 'insensitive' } } },
          { customer: { email: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.EnquiryWhereInput = { AND: conditions };

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, enquiries] = await Promise.all([
      prisma.enquiry.count({ where }),
      prisma.enquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    return {
      enquiries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve a single enquiry by ID with anti-enumeration check (404 on unauthorized).
   */
  public async getEnquiryById(user: AuthUserPayload, enquiryId: string) {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    const enquiry = await prisma.enquiry.findUnique({
      where: { id: enquiryId },
      include: {
        customer: true,
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        activities: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        statusHistory: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        quotations: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        followups: {
          orderBy: { dueAt: 'asc' },
        },
      },
    });

    if (!enquiry) {
      throw new NotFoundError('Enquiry not found');
    }

    const settings = await settingsService.getSettings();

    return {
      ...enquiry,
      allowEmployeeReassignment: settings.allowEmployeeReassignment,
    };
  }

  /**
   * Update enquiry general fields (status and assignedToId are disallowed here).
   */
  public async updateEnquiry(
    user: AuthUserPayload,
    enquiryId: string,
    data: UpdateEnquiryInput,
  ) {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.enquiry.update({
        where: { id: enquiryId },
        data: {
          phone: data.phone?.trim(),
          email: data.email?.trim().toLowerCase(),
          location: data.location?.trim(),
          source: data.source?.trim(),
          product: data.product?.trim(),
          priority: data.priority,
          expectedValue: data.expectedValue != null ? new Prisma.Decimal(data.expectedValue) : undefined,
          remarks: data.remarks?.trim(),
        },
        include: {
          customer: true,
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      if (data.remarks && data.remarks.trim() !== '') {
        await tx.activity.create({
          data: {
            enquiryId,
            userId: user.userId,
            type: ActivityType.REMARK_ADDED,
            description: data.remarks.trim(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'UPDATE',
          entityType: 'Enquiry',
          entityId: enquiryId,
          metadata: data as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  /**
   * Change enquiry status, inserting StatusHistory and Activity records.
   */
  public async changeStatus(
    user: AuthUserPayload,
    enquiryId: string,
    input: ChangeStatusInput,
  ) {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    return prisma.$transaction(async (tx) => {
      const current = await tx.enquiry.findUnique({
        where: { id: enquiryId },
        select: { id: true, status: true },
      });

      if (!current) {
        throw new NotFoundError('Enquiry not found');
      }

      // Update status
      const updated = await tx.enquiry.update({
        where: { id: enquiryId },
        data: { status: input.newStatus },
        include: {
          customer: true,
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // Write StatusHistory row
      await tx.statusHistory.create({
        data: {
          enquiryId,
          oldStatus: current.status,
          newStatus: input.newStatus,
          changedById: user.userId,
          reason: input.reason?.trim() || null,
        },
      });

      // Write Activity row
      await tx.activity.create({
        data: {
          enquiryId,
          userId: user.userId,
          type: ActivityType.STATUS_CHANGED,
          previousStatus: current.status,
          newStatus: input.newStatus,
          description: input.reason?.trim() || `Status changed to ${input.newStatus}`,
        },
      });

      return updated;
    });
  }

  /**
   * Assign an enquiry to an active user (Manager+ or Owning Employee when forwarding is enabled).
   */
  public async assignEnquiry(
    user: AuthUserPayload,
    enquiryId: string,
    assignedToId: string,
  ) {
    const hasAccess = await canAccessEnquiry(user, enquiryId);
    if (!hasAccess) {
      throw new NotFoundError('Enquiry not found');
    }

    const current = await prisma.enquiry.findUnique({
      where: { id: enquiryId },
      include: { assignedTo: true },
    });

    if (!current) {
      throw new NotFoundError('Enquiry not found');
    }

    const newAssignee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, name: true, role: true, isActive: true, email: true },
    });

    if (!newAssignee || !newAssignee.isActive) {
      throw new BadRequestError('Assigned user does not exist or is inactive.');
    }

    const isEmployeeCaller = user.role === Role.EMPLOYEE;

    if (isEmployeeCaller) {
      // 1. Check system setting
      const settings = await settingsService.getSettings();
      if (!settings.allowEmployeeReassignment) {
        throw new ForbiddenError('Employee enquiry forwarding is disabled by system settings.');
      }

      // 2. Caller must currently own this enquiry
      if (current.assignedToId !== user.userId) {
        throw new ForbiddenError('You can only forward enquiries currently assigned to you.');
      }

      // 3. Cannot forward to oneself
      if (assignedToId === user.userId) {
        throw new BadRequestError('You cannot forward an enquiry to yourself.');
      }

      // 4. Target must be another active EMPLOYEE (cannot forward up to Manager or Admin)
      if (newAssignee.role !== Role.EMPLOYEE) {
        throw new ForbiddenError('Employees can only forward enquiries to other active Employees.');
      }
    } else if (
      user.role === Role.ADMIN ||
      user.role === Role.MANAGER ||
      user.role === Role.AGM ||
      user.role === Role.DGM
    ) {
      // Manager+ logic allowed as today
    } else {
      throw new ForbiddenError('You do not have permission to assign enquiries.');
    }

    const oldAssigneeName = current.assignedTo?.name || 'Unassigned';
    const isEmployeeForward = isEmployeeCaller;

    // Distinguish Activity description:
    // "Forwarded from Priya Sharma to Amit Patel" vs "Reassigned from Priya Sharma to Amit Patel"
    const activityDescription = isEmployeeForward
      ? `Forwarded from ${oldAssigneeName} to ${newAssignee.name}`
      : `Reassigned from ${oldAssigneeName} to ${newAssignee.name}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Enquiry
      const updated = await tx.enquiry.update({
        where: { id: enquiryId },
        data: { assignedToId },
        include: {
          customer: true,
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // 2. Write Activity row (type: ENQUIRY_ASSIGNED)
      await tx.activity.create({
        data: {
          enquiryId,
          userId: user.userId,
          type: ActivityType.ENQUIRY_ASSIGNED,
          description: activityDescription,
        },
      });

      // 3. Write AuditLog row
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'ASSIGN',
          entityType: 'Enquiry',
          entityId: enquiryId,
          metadata: {
            previousAssignedToId: current.assignedToId,
            newAssignedToId: assignedToId,
            forwardType: isEmployeeForward ? 'EMPLOYEE_FORWARD' : 'MANAGER_REASSIGN',
          },
        },
      });

      // 4. Create Notification for newAssignee
      const targetLabel = updated.companyName || updated.product || updated.customer?.name || 'Lead';
      const notificationMessage = isEmployeeForward
        ? `Enquiry for "${targetLabel}" has been forwarded to you by ${oldAssigneeName}.`
        : `Enquiry for "${targetLabel}" has been assigned to you.`;

      await tx.notification.create({
        data: {
          userId: assignedToId,
          type: 'ENQUIRY_ASSIGNED',
          message: notificationMessage,
          relatedEnquiryId: enquiryId,
          read: false,
        },
      });

      return updated;
    });

    // Decoupled email alert for high-signal enquiry assignment/forward
    if (result.assignedTo?.email) {
      const targetLabel = result.companyName || result.product || result.customer?.name || 'Lead';
      const emailSubject = isEmployeeForward
        ? `[HB CRM] Enquiry Forwarded: ${targetLabel}`
        : `[HB CRM] New Enquiry Assigned: ${targetLabel}`;
      const emailBody = isEmployeeForward
        ? `Hello ${result.assignedTo.name},\n\nAn enquiry for "${targetLabel}" has been forwarded to you by ${oldAssigneeName}.\n\nPriority: ${result.priority}\n\nPlease log in to HB CRM to review details and continue follow-up:\nhttp://localhost:5173/enquiries/${enquiryId}\n\nBest regards,\nHB CRM Notifications`
        : `Hello ${result.assignedTo.name},\n\nYou have been assigned a new enquiry: "${targetLabel}".\n\nPriority: ${result.priority}\n\nPlease log in to HB CRM to review details and begin follow-up:\nhttp://localhost:5173/enquiries/${enquiryId}\n\nBest regards,\nHB CRM Notifications`;

      void emailService.sendEmail(
        result.assignedTo.email,
        emailSubject,
        emailBody,
      ).catch((err) => console.error('[Enquiry] Failed to dispatch assignment email:', err));
    }

    return result;
  }
}

export const enquiryService = new EnquiryService();
