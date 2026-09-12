import { Role, Priority, EnquiryStatus, ActivityType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { BadRequestError } from '../utils/errors.js';
import { parseCsv, sanitizeCsvField } from '../utils/csv.parser.js';
import { getSubordinateUserIds } from './enquiry.access.js';

export const MAX_IMPORT_ROWS = 500;

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportEnquiriesResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ImportService {
  /**
   * Bulk imports enquiries and find-or-creates customers from a CSV file.
   * Capped at 500 rows. Fault-tolerant: errors on individual rows are recorded without failing the batch.
   */
  public async importEnquiries(
    caller: AuthUserPayload,
    csvBuffer: Buffer,
  ): Promise<ImportEnquiriesResult> {
    const csvContent = csvBuffer.toString('utf-8');
    const parsed = parseCsv(csvContent);

    if (parsed.rows.length === 0) {
      throw new BadRequestError('CSV file is empty or contains no data rows.');
    }

    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestError(
        `CSV file contains ${parsed.rows.length} rows, which exceeds the maximum limit of ${MAX_IMPORT_ROWS} rows per import. Please split the file into smaller batches.`,
      );
    }

    // Pre-fetch active users for fast O(1) in-memory lookup
    const activeUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });

    const userByEmail = new Map<string, (typeof activeUsers)[0]>();
    const usersByName = new Map<string, (typeof activeUsers)[0][]>();

    for (const u of activeUsers) {
      userByEmail.set(u.email.trim().toLowerCase(), u);
      const normalizedName = u.name.trim().toLowerCase();
      const existing = usersByName.get(normalizedName) || [];
      existing.push(u);
      usersByName.set(normalizedName, existing);
    }

    // Determine allowed assignees for caller
    let allowedAssigneeIds: Set<string> | null = null;
    if (caller.role !== Role.ADMIN) {
      const subordinateIds = await getSubordinateUserIds(caller.userId);
      allowedAssigneeIds = new Set([caller.userId, ...subordinateIds]);
    }

    let imported = 0;
    let skipped = 0;
    const errors: ImportRowError[] = [];

    for (const rowItem of parsed.rows) {
      const { rowNumber, data } = rowItem;

      // 1. Validate Phone (Required)
      const rawPhone = data.phone?.trim();
      if (!rawPhone) {
        errors.push({
          row: rowNumber,
          reason: 'Phone number is required.',
        });
        skipped++;
        continue;
      }

      // 2. Validate Email format if present
      const rawEmail = data.email?.trim().toLowerCase();
      if (rawEmail && !EMAIL_REGEX.test(rawEmail)) {
        errors.push({
          row: rowNumber,
          reason: `Invalid email format: "${data.email}".`,
        });
        skipped++;
        continue;
      }

      // 3. Validate Priority enum if present
      let resolvedPriority: Priority = Priority.MEDIUM;
      if (data.priority && data.priority.trim()) {
        const normalizedPriority = data.priority.trim().toUpperCase();
        if (Object.values(Priority).includes(normalizedPriority as Priority)) {
          resolvedPriority = normalizedPriority as Priority;
        } else {
          errors.push({
            row: rowNumber,
            reason: `Invalid priority: "${data.priority}". Must be LOW, MEDIUM, or HIGH.`,
          });
          skipped++;
          continue;
        }
      }

      // 4. Validate Expected Value if present
      let numericExpectedValue: number | null = null;
      if (data.expectedValue && data.expectedValue.trim()) {
        // Strip common currency symbols, commas and spaces
        const cleanedValue = data.expectedValue.replace(/[₹$,\s]/g, '');
        const parsedValue = Number(cleanedValue);
        if (isNaN(parsedValue) || parsedValue < 0) {
          errors.push({
            row: rowNumber,
            reason: `Invalid expected value: "${data.expectedValue}". Must be a valid positive number.`,
          });
          skipped++;
          continue;
        }
        numericExpectedValue = parsedValue;
      }

      // 5. Validate Assigned To if present
      let assignedUser: (typeof activeUsers)[0] | null = null;
      if (data.assignedTo && data.assignedTo.trim()) {
        const targetSearch = data.assignedTo.trim().toLowerCase();
        const matchedByEmail = userByEmail.get(targetSearch);

        if (matchedByEmail) {
          // Hierarchy scoping for Manager/AGM/DGM
          if (allowedAssigneeIds && !allowedAssigneeIds.has(matchedByEmail.id)) {
            errors.push({
              row: rowNumber,
              reason: `Cannot assign to "${data.assignedTo}". User is not within your reporting hierarchy.`,
            });
            skipped++;
            continue;
          }
          assignedUser = matchedByEmail;
        } else {
          // Lookup by Name
          const candidates = usersByName.get(targetSearch) || [];

          if (candidates.length === 0) {
            errors.push({
              row: rowNumber,
              reason: `Assigned user "${data.assignedTo}" not found or is inactive.`,
            });
            skipped++;
            continue;
          }

          // Hierarchy filter if caller is restricted
          const eligibleCandidates = allowedAssigneeIds
            ? candidates.filter((u) => allowedAssigneeIds.has(u.id))
            : candidates;

          if (eligibleCandidates.length === 0) {
            errors.push({
              row: rowNumber,
              reason: `Cannot assign to "${data.assignedTo}". User is not within your reporting hierarchy.`,
            });
            skipped++;
            continue;
          }

          if (eligibleCandidates.length > 1) {
            errors.push({
              row: rowNumber,
              reason: `Ambiguous assignee "${data.assignedTo}". Multiple active users match this name. Please specify their unique email address instead.`,
            });
            skipped++;
            continue;
          }

          assignedUser = eligibleCandidates[0]!;
        }
      }

      // 6. Process row inside an isolated transaction
      try {
        await prisma.$transaction(async (tx) => {
          // Sanitize text fields against CSV formula injection (=, +, -, @, \t, \r)
          const sanitizedCustomerName = sanitizeCsvField(data.customerName);
          const sanitizedCompany = sanitizeCsvField(data.company);
          const sanitizedLocation = sanitizeCsvField(data.location);
          const sanitizedSource = sanitizeCsvField(data.source) || 'CSV_IMPORT';
          const sanitizedProduct = sanitizeCsvField(data.product);
          const sanitizedRemarks = sanitizeCsvField(data.remarks);

          // A. Find-or-create Customer by normalized phone number (natural dedup key)
          let customer = await tx.customer.findFirst({
            where: { phone: rawPhone },
          });

          if (!customer) {
            customer = await tx.customer.create({
              data: {
                name:
                  sanitizedCustomerName ||
                  sanitizedCompany ||
                  `Customer ${rawPhone}`,
                companyName: sanitizedCompany || null,
                phone: rawPhone,
                email: rawEmail || null,
                location: sanitizedLocation || null,
                notes: sanitizedRemarks || null,
                assignedToId: assignedUser?.id || null,
              },
            });

            // Customer creation audit log
            await tx.auditLog.create({
              data: {
                userId: caller.userId,
                action: 'CREATE',
                entityType: 'Customer',
                entityId: customer.id,
                metadata: {
                  source: 'CSV_IMPORT',
                  phone: rawPhone,
                },
              },
            });
          }

          // B. Create Enquiry linked to customer
          const enquiry = await tx.enquiry.create({
            data: {
              customerId: customer.id,
              companyName: sanitizedCompany || customer.companyName || null,
              phone: rawPhone,
              email: rawEmail || customer.email || null,
              location: sanitizedLocation || customer.location || null,
              source: sanitizedSource,
              product: sanitizedProduct || null,
              priority: resolvedPriority,
              expectedValue:
                numericExpectedValue != null
                  ? new Prisma.Decimal(numericExpectedValue)
                  : null,
              remarks: sanitizedRemarks || null,
              assignedToId: assignedUser?.id || null,
              createdById: caller.userId,
              status: EnquiryStatus.NEW,
            },
          });

          // C. Activity row: type ENQUIRY_ASSIGNED if assignedToId is set
          if (assignedUser) {
            await tx.activity.create({
              data: {
                enquiryId: enquiry.id,
                userId: caller.userId,
                type: ActivityType.ENQUIRY_ASSIGNED,
                description: `Enquiry created and assigned to ${assignedUser.name}`,
              },
            });
          }

          // D. StatusHistory row: oldStatus null -> NEW
          await tx.statusHistory.create({
            data: {
              enquiryId: enquiry.id,
              oldStatus: null,
              newStatus: EnquiryStatus.NEW,
              changedById: caller.userId,
              reason: 'Initial enquiry creation via CSV import',
            },
          });

          // E. AuditLog row: source "CSV_IMPORT" in metadata
          await tx.auditLog.create({
            data: {
              userId: caller.userId,
              action: 'CREATE',
              entityType: 'Enquiry',
              entityId: enquiry.id,
              metadata: {
                status: EnquiryStatus.NEW,
                assignedToId: enquiry.assignedToId,
                priority: enquiry.priority,
                customerId: enquiry.customerId,
                source: 'CSV_IMPORT',
              },
            },
          });

          // F. In-app notification for assigned user
          if (assignedUser && assignedUser.id !== caller.userId) {
            const leadLabel =
              enquiry.companyName || enquiry.product || customer.name || 'New Lead';
            await tx.notification.create({
              data: {
                userId: assignedUser.id,
                type: 'ENQUIRY_ASSIGNED',
                message: `New enquiry for "${leadLabel}" has been assigned to you.`,
                relatedEnquiryId: enquiry.id,
                read: false,
              },
            });
          }
        });

        imported++;
      } catch (rowErr) {
        errors.push({
          row: rowNumber,
          reason:
            rowErr instanceof Error
              ? rowErr.message
              : 'Unexpected database error occurred during row import.',
        });
        skipped++;
      }
    }

    return {
      totalRows: parsed.rows.length,
      imported,
      skipped,
      errors,
    };
  }
}

export const importService = new ImportService();
