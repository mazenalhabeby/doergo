import { BadRequestException } from '@nestjs/common';

/** When a repeat runs: the fields each frequency needs, and the next run after a date. */

/**
 * Validate frequency-specific required fields
 */
export function validateFrequencyFields(
  frequency: string,
  data: { customDays?: number; dayOfWeek?: number; dayOfMonth?: number },
) {
  switch (frequency) {
    case 'CUSTOM':
      if (!data.customDays || data.customDays < 1) {
        throw new BadRequestException('CUSTOM frequency requires customDays >= 1');
      }
      break;
    case 'WEEKLY':
    case 'BIWEEKLY':
      if (data.dayOfWeek === undefined || data.dayOfWeek === null) {
        throw new BadRequestException(`${frequency} frequency requires dayOfWeek (0-6)`);
      }
      break;
    case 'MONTHLY':
    case 'QUARTERLY':
      if (data.dayOfMonth === undefined || data.dayOfMonth === null) {
        throw new BadRequestException(`${frequency} frequency requires dayOfMonth (1-31)`);
      }
      break;
  }
}

/**
 * Calculate the next run date based on frequency
 */
export function calculateNextRun(
  frequency: string,
  startDate: Date,
  lastGenerated: Date | null,
  dayOfWeek?: number,
  dayOfMonth?: number,
  customDays?: number,
): Date {
  const baseDate = lastGenerated || startDate;
  const next = new Date(baseDate);

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;

    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      if (dayOfWeek !== undefined) {
        // Adjust to target day of week
        const diff = dayOfWeek - next.getDay();
        next.setDate(next.getDate() + (diff >= 0 ? diff : diff + 7));
      }
      break;

    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14);
      if (dayOfWeek !== undefined) {
        const diff = dayOfWeek - next.getDay();
        next.setDate(next.getDate() + (diff >= 0 ? diff : diff + 7));
      }
      break;

    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth !== undefined) {
        // Handle months with fewer days
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;

    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      if (dayOfMonth !== undefined) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;

    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;

    case 'CUSTOM':
      if (customDays) {
        next.setDate(next.getDate() + customDays);
      }
      break;
  }

  // If the calculated next run is before now, advance to the future
  const now = new Date();
  if (next <= now) {
    return calculateNextRun(frequency, startDate, next, dayOfWeek, dayOfMonth, customDays);
  }

  return next;
}
