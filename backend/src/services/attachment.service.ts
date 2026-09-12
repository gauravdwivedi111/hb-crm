import crypto from 'crypto';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import { storageService } from './storage.service.js';
import {
  canAccessEnquiry,
  canAccessCustomer,
  isManagerPlus,
} from './enquiry.access.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../utils/errors.js';

export interface CreateAttachmentParams {
  enquiryId?: string | null;
  customerId?: string | null;
}

// Allowed MIME types
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'pdf',
  'docx',
  'xlsx',
]);

export class AttachmentService {
  /**
   * Helper to verify access to the parent entity (Enquiry or Customer).
   */
  private async checkParentAccess(
    user: AuthUserPayload,
    enquiryId?: string | null,
    customerId?: string | null,
  ): Promise<boolean> {
    if (enquiryId) {
      return await canAccessEnquiry(user, enquiryId);
    }
    if (customerId) {
      return await canAccessCustomer(user, customerId);
    }
    return false;
  }

  /**
   * Uploads and records an attachment.
   * Validates:
   * 1. Mutual exclusivity of enquiryId / customerId
   * 2. Pre-upload authorization to the parent entity
   * 3. Magic-number inspection via file-type
   * 4. Explicit MIME & extension allowlist
   * 5. Non-guessable random UUID key generation
   */
  public async createAttachment(
    user: AuthUserPayload,
    file: Express.Multer.File | undefined,
    params: CreateAttachmentParams,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestError('No file provided or file is empty.');
    }

    const { enquiryId, customerId } = params;

    // Mutual exclusivity
    const hasEnquiry = Boolean(enquiryId && enquiryId.trim() !== '');
    const hasCustomer = Boolean(customerId && customerId.trim() !== '');

    if ((hasEnquiry && hasCustomer) || (!hasEnquiry && !hasCustomer)) {
      throw new BadRequestError(
        'Attachment must be linked to exactly one of enquiryId OR customerId.',
      );
    }

    const cleanEnquiryId = hasEnquiry ? enquiryId!.trim() : null;
    const cleanCustomerId = hasCustomer ? customerId!.trim() : null;

    // Pre-upload access verification (Anti-enumeration: 404 if not found / unauthorized)
    const hasAccess = await this.checkParentAccess(
      user,
      cleanEnquiryId,
      cleanCustomerId,
    );

    if (!hasAccess) {
      throw new NotFoundError('Target entity not found');
    }

    // Inspect file buffer magic numbers
    const detectedType = await fileTypeFromBuffer(file.buffer);

    if (!detectedType) {
      throw new BadRequestError(
        'Unable to determine file type from content signature. File rejected.',
      );
    }

    // Check against allowlist
    if (!ALLOWED_MIME_TYPES.has(detectedType.mime) || !ALLOWED_EXTENSIONS.has(detectedType.ext)) {
      throw new BadRequestError(
        `Unsupported file type "${detectedType.mime}". Allowed types: JPEG, PNG, WEBP, PDF, DOCX, XLSX.`,
      );
    }

    // Verify client-claimed extension does not conflict with detected type
    const rawExt = path.extname(file.originalname).toLowerCase().replace('.', '');
    const normalizedExt = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const normalizedDetectedExt = detectedType.ext === 'jpeg' ? 'jpg' : detectedType.ext;

    if (normalizedExt && normalizedExt !== normalizedDetectedExt) {
      throw new BadRequestError(
        `File extension ".${rawExt}" does not match detected file signature "${detectedType.ext}".`,
      );
    }

    // Generate random, non-guessable storage key
    const uniqueId = crypto.randomUUID();
    const timestamp = Date.now();
    const storageKey = `attachments/${uniqueId}-${timestamp}.${detectedType.ext}`;

    // Upload to private S3/R2 storage
    await storageService.uploadFile(storageKey, file.buffer, detectedType.mime);

    // Save record to database
    const attachment = await prisma.attachment.create({
      data: {
        enquiryId: cleanEnquiryId,
        customerId: cleanCustomerId,
        uploadedById: user.userId,
        fileKey: storageKey,
        fileName: file.originalname,
        fileType: detectedType.mime,
        fileSize: file.size,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return attachment;
  }

  /**
   * Generates a short-lived signed download URL (5-minute expiry / 300s).
   * Anti-enumeration: returns 404 if attachment does not exist or user lacks access.
   */
  public async getDownloadUrl(user: AuthUserPayload, attachmentId: string) {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    const hasAccess = await this.checkParentAccess(
      user,
      attachment.enquiryId,
      attachment.customerId,
    );

    if (!hasAccess) {
      throw new NotFoundError('Attachment not found');
    }

    const signedUrl = await storageService.generatePresignedDownloadUrl(
      attachment.fileKey,
      300, // 5 minutes
    );

    return {
      downloadUrl: signedUrl,
      expiresIn: 300,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
    };
  }

  /**
   * Deletes an attachment (Manager+ only).
   * Deletes the S3 object and the DB row, and creates an AuditLog row.
   */
  public async deleteAttachment(user: AuthUserPayload, attachmentId: string) {
    if (!isManagerPlus(user.role)) {
      throw new ForbiddenError('Only managers and administrators can delete attachments.');
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    const hasAccess = await this.checkParentAccess(
      user,
      attachment.enquiryId,
      attachment.customerId,
    );

    if (!hasAccess) {
      throw new NotFoundError('Attachment not found');
    }

    // Delete DB record and log in AuditLog in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({
        where: { id: attachmentId },
      });

      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'ATTACHMENT_DELETED',
          entityType: 'Attachment',
          entityId: attachment.id,
          metadata: {
            fileName: attachment.fileName,
            fileKey: attachment.fileKey,
            enquiryId: attachment.enquiryId,
            customerId: attachment.customerId,
            fileSize: attachment.fileSize,
          },
        },
      });
    });

    // Delete from S3 storage
    await storageService.deleteFile(attachment.fileKey);

    return {
      id: attachment.id,
      deleted: true,
    };
  }
}

export const attachmentService = new AttachmentService();
