import type { TFunction } from 'i18next';
import { ApiError } from '@/lib/api/client';

/** A refusal in the reader's language when the server sent a code we know; its own words otherwise. */
export function calendarError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError && err.code) {
    const s = t(`calendar.errors.${err.code}`, { defaultValue: '' });
    if (s) return s;
  }
  return err instanceof Error && err.message ? err.message : t('common.error', 'Something went wrong');
}
