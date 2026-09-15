import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
if (!jwtAccessSecret || jwtAccessSecret.trim() === '') {
  console.error('[FATAL] JWT_ACCESS_SECRET is required but missing from environment. Exiting.');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl.trim() === '') {
  console.error('[FATAL] DATABASE_URL is required but missing from environment. Exiting.');
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';
const attachmentsEnabled = process.env.ENABLE_ATTACHMENTS === 'true';

if (isProduction) {
  const missingProdKeys: string[] = [];
  if (attachmentsEnabled) {
    if (!process.env.S3_ACCESS_KEY_ID) missingProdKeys.push('S3_ACCESS_KEY_ID');
    if (!process.env.S3_SECRET_ACCESS_KEY) missingProdKeys.push('S3_SECRET_ACCESS_KEY');
    if (!process.env.S3_BUCKET_NAME) missingProdKeys.push('S3_BUCKET_NAME');
  } else {
    console.info('[INFO] Attachments feature is disabled (ENABLE_ATTACHMENTS !== true). Skipping S3/R2 credential validation.');
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[WARN] RESEND_API_KEY is not configured in production. Password reset and notification emails will be disabled.');
  }

  if (missingProdKeys.length > 0) {
    console.error(`[FATAL] Missing mandatory production environment variables: ${missingProdKeys.join(', ')}. Exiting.`);
    process.exit(1);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl,
  frontendUrl: process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProduction,
  attachmentsEnabled,
  jwt: {
    accessSecret: jwtAccessSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10),
  },
  s3: {
    bucketName: process.env.S3_BUCKET_NAME || 'hb-crm-attachments',
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  cookieSameSite: ((process.env.COOKIE_SAME_SITE as 'none' | 'lax' | 'strict') || (isProduction ? 'none' : 'lax')),
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'HB CRM <onboarding@resend.dev>',
  },
} as const;
