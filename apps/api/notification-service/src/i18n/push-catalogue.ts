import { SUPPORTED_LOCALES, type SupportedLocale } from '@hbcfield/shared';
import { PUSH_MESSAGES as MAIN, type PushKey as MainPushKey } from './push-messages';
import { ATTENDANCE_PUSH_MESSAGES, type AttendancePushKey } from './push-messages-attendance';
import { APPROVAL_PUSH_MESSAGES, type ApprovalPushKey } from './push-messages-approvals';

export type { PushPluralKey } from './push-messages';

/** Every push sentence key: the main catalogue and the small ones beside it. */
export type PushKey = MainPushKey | AttendancePushKey | ApprovalPushKey;

/** The catalogue `render` reads: the main one with the small ones merged in, per language. */
export const PUSH_MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((l) => [l, { ...MAIN[l], ...ATTENDANCE_PUSH_MESSAGES[l], ...APPROVAL_PUSH_MESSAGES[l] }]),
) as Record<SupportedLocale, Record<PushKey, string>>;
