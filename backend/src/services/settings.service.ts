import { prisma } from '../prisma/client.js';

export interface SystemSettingsResult {
  id: string;
  allowEmployeeReassignment: boolean;
  updatedAt: Date;
}

export class SettingsService {
  /**
   * Retrieves the current system configuration.
   * Auto-seeds the singleton 'default' row if not already present.
   */
  public async getSettings(): Promise<SystemSettingsResult> {
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        allowEmployeeReassignment: false,
      },
    });

    return settings;
  }

  /**
   * Updates the system settings flag.
   */
  public async updateSettings(
    allowEmployeeReassignment: boolean,
  ): Promise<SystemSettingsResult> {
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: {
        allowEmployeeReassignment,
      },
      create: {
        id: 'default',
        allowEmployeeReassignment,
      },
    });

    return settings;
  }
}

export const settingsService = new SettingsService();
