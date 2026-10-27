/** Events about approvals: second steps and reminders (notification-service approval handler). */
import { event } from '../event';
import type { RuleKind } from '../../approvals/approval-rules';
import type { SentNotRead } from './events-types';

export const approvalSecondStepEvent = event<
  {
    recipientIds?: string[];
    kind: string;
    itemId: string;
    firstName?: string;
    subjectName?: string;
  } & SentNotRead<'organizationId'>
>('approval_second_step');

export const approvalReminderEvent = event<
  {
    recipientIds?: string[];
    kind: RuleKind;
    itemId: string;
    stage: 'REMIND' | 'ESCALATE';
    subjectName?: string;
    hours?: number;
  } & SentNotRead<'organizationId'>
>('approval_reminder');
