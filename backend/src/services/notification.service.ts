import { Prisma, Notification } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { NotFoundError } from '../utils/errors.js';
import { emailService } from './email.service.js';

export const HIGH_SIGNAL_NOTIFICATION_TYPES = [
  'FOLLOWUP_OVERDUE',
  'ENQUIRY_ASSIGNED',
] as const;

export type HighSignalNotificationType = (typeof HIGH_SIGNAL_NOTIFICATION_TYPES)[number];

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  message: string;
  relatedEnquiryId?: string | null;
  emailSubject?: string;
  emailBody?: string;
  recipientEmail?: string;
}

export class NotificationService {
  /**
   * Helper to dispatch email for high-signal notifications.
   * Completely decoupled and wrapped in a safe catch block so failures never block callers.
   */
  private async dispatchEmailSafely(
    input: CreateNotificationInput,
  ): Promise<void> {
    try {
      const isHighSignal = (HIGH_SIGNAL_NOTIFICATION_TYPES as readonly string[]).includes(
        input.type,
      );
      if (!isHighSignal) {
        return;
      }

      let toEmail = input.recipientEmail;
      let userName = 'Team Member';

      if (!toEmail) {
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true, name: true, isActive: true },
        });
        if (!user || !user.isActive) {
          return;
        }
        toEmail = user.email;
        userName = user.name;
      }

      const defaultSubject =
        input.type === 'FOLLOWUP_OVERDUE'
          ? '[HB CRM Alert] Follow-up Overdue'
          : '[HB CRM] New Enquiry Assigned';

      const subject = input.emailSubject || defaultSubject;
      const body =
        input.emailBody ||
        `Hello ${userName},\n\n${input.message}\n\nPlease log in to HB CRM to take action:\nhttp://localhost:5173\n\nBest regards,\nHB CRM Notifications`;

      // Non-blocking fire-and-forget
      void emailService.sendEmail(toEmail, subject, body);
    } catch (err) {
      console.error('[NotificationService] Failed to dispatch notification email:', err);
    }
  }

  /**
   * Create a single notification row and trigger high-signal email side-effects.
   */
  public async createNotification(
    input: CreateNotificationInput,
  ): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        relatedEnquiryId: input.relatedEnquiryId || null,
        read: false,
      },
    });

    // Fire email asynchronously without awaiting to ensure absolute decoupling
    void this.dispatchEmailSafely(input);

    return notification;
  }

  /**
   * Create multiple notifications and trigger high-signal emails for applicable entries.
   */
  public async createManyNotifications(
    inputs: CreateNotificationInput[],
  ): Promise<{ count: number }> {
    if (inputs.length === 0) {
      return { count: 0 };
    }

    const result = await prisma.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        message: i.message,
        relatedEnquiryId: i.relatedEnquiryId || null,
        read: false,
      })),
    });

    // Trigger high-signal emails
    for (const item of inputs) {
      void this.dispatchEmailSafely(item);
    }

    return result;
  }

  /**
   * List notifications for the authenticated user, paginated, newest first.
   */
  public async listNotifications(userId: string, query: ListNotificationsQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { read: false } : {}),
    };

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, read: false } }),
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      notifications,
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark a single notification as read (only owning user).
   */
  public async markAsRead(userId: string, notificationId: string) {
    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!existing) {
      throw new NotFoundError('Notification not found');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  /**
   * Mark all notifications for the authenticated user as read.
   */
  public async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { markedCount: result.count };
  }
}

export const notificationService = new NotificationService();
