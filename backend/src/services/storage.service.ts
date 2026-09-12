import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private isTestOrMock: boolean;
  private mockStore: Map<string, { buffer: Buffer; mimeType: string }> = new Map();

  constructor() {
    this.bucketName = config.s3.bucketName;
    this.isTestOrMock =
      process.env.NODE_ENV === 'test' ||
      process.env.STORAGE_DRIVER === 'mock' ||
      config.s3.accessKeyId === 'mock-access-key';

    const clientConfig: S3ClientConfig = {
      region: config.s3.region || 'us-east-1',
    };

    if (config.s3.endpoint) {
      clientConfig.endpoint = config.s3.endpoint;
    }

    if (config.s3.accessKeyId && config.s3.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      };
    } else {
      // Fallback credentials for URL signing
      clientConfig.credentials = {
        accessKeyId: 'default-mock-key',
        secretAccessKey: 'default-mock-secret',
      };
    }

    this.s3Client = new S3Client(clientConfig);
  }

  /**
   * Uploads a file buffer to private S3/R2 storage.
   */
  public async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    if (this.isTestOrMock) {
      this.mockStore.set(key, { buffer, mimeType });
      return;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      });

      await this.s3Client.send(command);
    } catch (err) {
      // In development, fallback to mock if remote S3 is not reached
      if (!config.isProduction) {
        console.warn(`[StorageService] S3 upload failed; falling back to local memory store: ${(err as Error).message}`);
        this.mockStore.set(key, { buffer, mimeType });
        return;
      }
      throw err;
    }
  }

  /**
   * Generates a short-lived presigned download URL (default 5 minutes / 300s).
   */
  public async generatePresignedDownloadUrl(
    key: string,
    expiresInSeconds: number = 300,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Deletes a file from S3/R2 storage.
   */
  public async deleteFile(key: string): Promise<void> {
    if (this.isTestOrMock) {
      this.mockStore.delete(key);
      return;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (err) {
      if (!config.isProduction) {
        console.warn(`[StorageService] S3 delete failed; falling back to local memory store: ${(err as Error).message}`);
        this.mockStore.delete(key);
        return;
      }
      throw err;
    }
  }
}

export const storageService = new StorageService();
