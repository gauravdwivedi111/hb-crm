import { DateTime } from 'luxon';
import { config } from '../config/env.js';

/**
 * Returns the configured system timezone (defaults to 'Asia/Kolkata').
 */
export function getTimezone(): string {
  return config.timezone || 'Asia/Kolkata';
}

/**
 * Computes exact startOfDay (00:00:00.000) and endOfDay (23:59:59.999)
 * for the configured timezone regardless of the server's local host timezone.
 */
export function getTimezoneDayBoundaries(
  referenceDate: Date = new Date(),
  zone: string = getTimezone(),
): { startOfDay: Date; endOfDay: Date } {
  const dt = DateTime.fromJSDate(referenceDate, { zone });
  return {
    startOfDay: dt.startOf('day').toJSDate(),
    endOfDay: dt.endOf('day').toJSDate(),
  };
}

/**
 * Computes exact startOfMonth and endOfMonth
 * for the configured timezone regardless of the server's local host timezone.
 */
export function getTimezoneMonthBoundaries(
  referenceDate: Date = new Date(),
  zone: string = getTimezone(),
): { startOfMonth: Date; endOfMonth: Date } {
  const dt = DateTime.fromJSDate(referenceDate, { zone });
  return {
    startOfMonth: dt.startOf('month').toJSDate(),
    endOfMonth: dt.endOf('month').toJSDate(),
  };
}
