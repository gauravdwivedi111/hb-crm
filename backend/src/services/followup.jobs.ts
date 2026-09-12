import cron, { ScheduledTask } from 'node-cron';
import { FollowupStatus } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { config } from '../config/env.js';
import { emailService } from './email.service.js';

let cronTask: ScheduledTask | null = null;

/**
 * Scans for overdue PENDING followups, updates them to OVERDUE,
 * and creates batch notifications for assignees and supervisors.
 */
export async function checkOverdueFollowups(): Promise<{
  updatedCount: number;
  notificationsCount: number;
}> {
  const now = new Date();

  // Fetch pending followups that are past their dueAt
  const overdueFollowups = await prisma.followup.findMany({
    where: {
      status: FollowupStatus.PENDING,
      dueAt: { lt: now },
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          supervisorId: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      customer: {
        select: { id: true, name: true },
      },
      enquiry: {
        select: { id: true, product: true, companyName: true },
      },
    },
  });

  if (overdueFollowups.length === 0) {
    return { updatedCount: 0, notificationsCount: 0 };
  }

  const overdueIds = overdueFollowups.map((f) => f.id);

  // Build notifications array for both assignee and supervisor
  const notificationsData: Array<{
    userId: string;
    type: string;
    message: string;
    relatedEnquiryId: string | null;
  }> = [];

  const emailsToDispatch: Array<{
    to: string;
    subject: string;
    body: string;
  }> = [];

  for (const followup of overdueFollowups) {
    const targetLabel =
      followup.customer?.name ||
      followup.enquiry?.companyName ||
      followup.enquiry?.product ||
      'Customer';

    const formattedDue = followup.dueAt.toISOString();

    // 1. Notification for assigned user
    const userMessage = `Follow-up for "${targetLabel}" is overdue (was due on ${formattedDue}).`;
    notificationsData.push({
      userId: followup.assignedToId,
      type: 'FOLLOWUP_OVERDUE',
      message: userMessage,
      relatedEnquiryId: followup.enquiryId || null,
    });

    if (followup.assignedTo?.email) {
      emailsToDispatch.push({
        to: followup.assignedTo.email,
        subject: `[HB CRM Alert] Follow-up Overdue: ${targetLabel}`,
        body: `Hello ${followup.assignedTo.name},\n\nA scheduled follow-up for "${targetLabel}" is now overdue.\n\nDue Date: ${formattedDue}\nPurpose: ${followup.purpose || 'Follow-up'}\n\nPlease log in to HB CRM to review and update your follow-up:\nhttp://localhost:5173\n\nBest regards,\nHB CRM Notifications`,
      });
    }

    // 2. Notification for supervisor (if exists)
    if (followup.assignedTo?.supervisorId) {
      const supMessage = `Subordinate ${followup.assignedTo.name}'s follow-up for "${targetLabel}" is overdue.`;
      notificationsData.push({
        userId: followup.assignedTo.supervisorId,
        type: 'FOLLOWUP_OVERDUE',
        message: supMessage,
        relatedEnquiryId: followup.enquiryId || null,
      });

      if (followup.assignedTo.supervisor?.email) {
        emailsToDispatch.push({
          to: followup.assignedTo.supervisor.email,
          subject: `[HB CRM Alert] Team Follow-up Overdue: ${targetLabel} (${followup.assignedTo.name})`,
          body: `Hello ${followup.assignedTo.supervisor.name},\n\nA follow-up assigned to your subordinate ${followup.assignedTo.name} for "${targetLabel}" is overdue.\n\nDue Date: ${formattedDue}\nPurpose: ${followup.purpose || 'Follow-up'}\n\nPlease check your Team Dashboard on HB CRM:\nhttp://localhost:5173\n\nBest regards,\nHB CRM Notifications`,
        });
      }
    }
  }

  // Atomically update statuses and insert notifications in single batch
  await prisma.$transaction(async (tx) => {
    await tx.followup.updateMany({
      where: { id: { in: overdueIds } },
      data: { status: FollowupStatus.OVERDUE },
    });

    if (notificationsData.length > 0) {
      await tx.notification.createMany({
        data: notificationsData,
      });
    }
  });

  console.info(
    `[Overdue Cron] Marked ${overdueIds.length} follow-up(s) as OVERDUE and created ${notificationsData.length} notification(s).`,
  );

  // Decoupled, non-blocking email dispatch
  for (const item of emailsToDispatch) {
    void emailService.sendEmail(item.to, item.subject, item.body).catch((err) => {
      console.error('[Overdue Cron] Failed to send email alert:', err);
    });
  }

  return {
    updatedCount: overdueIds.length,
    notificationsCount: notificationsData.length,
  };
}

/**
 * Start the background cron job to detect overdue followups every 5 minutes.
 * Will not run in test environments.
 */
export function startFollowupCron(): ScheduledTask | null {
  if (config.nodeEnv === 'test') {
    console.info('[Overdue Cron] Skipped starting cron in test environment.');
    return null;
  }

  // Schedule to run every 5 minutes
  cronTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await checkOverdueFollowups();
    } catch (error) {
      console.error('[Overdue Cron Error] Failed executing overdue follow-up check:', error);
    }
  });

  console.info('[Overdue Cron] Scheduled job registered (running every 5 minutes).');
  return cronTask;
}

export function stopFollowupCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.info('[Overdue Cron] Scheduled job stopped.');
  }
}
