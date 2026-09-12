/* eslint-disable @typescript-eslint/no-namespace */
import { Role } from '@prisma/client';

export interface AuthUserPayload {
  userId: string;
  role: Role;
}

export interface SanitizedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  supervisorId: string | null;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}
