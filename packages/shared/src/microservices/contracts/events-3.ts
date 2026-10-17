import { event } from '../event';
import type { ChatMessageFacts, SentNotRead } from './events-types';

/**
 * Events handled by notification-service (chat-notification.handler, crew-notification.handler, crm-
 * reminder.handler, document-notification.handler). Payload = what the handler reads.
 */

export const chatMessageEvent = event<{
  conversationId: string;
  message: ChatMessageFacts;
  recipients: string[];
  /** ⚠️ Not sent by a SYSTEM line (chat-system.ts) — kept as it is. */
  organizationId?: string;
  unread?: Record<string, number>;
  badge?: Record<string, number>;
  /** Members who switched this thread's pushes off. */
  muted?: string[];
  /** A SYSTEM line ("Anna added Karim"): drawn on screens, never pushed. */
  silent?: boolean;
}>('chat_message');

export const chatBadgeEvent = event<{ userId: string; total: number }>('chat_badge');

export const chatReadEvent = event<{ conversationId: string; userId: string; at: string; memberIds: string[] }>(
  'chat_read',
);

export const chatMembersChangedEvent = event<{ conversationId: string; userIds: string[]; removedIds?: string[] }>(
  'chat_members_changed',
);

export const chatMessageChangedEvent = event<{ conversationId: string; message: unknown; memberIds: string[] }>(
  'chat_message_changed',
);

export const taskHandoverAddedEvent = event<
  {
    taskId: string;
    taskTitle: string;
    authorName: string;
    recipientIds: string[];
    organizationId: string;
  } & SentNotRead<'authorId'>
>('task_handover_added');

export const taskStartedForYouEvent = event<{
  taskId: string;
  taskTitle: string;
  userId: string;
  byName: string;
  reason: string;
  organizationId: string;
}>('task_started_for_you');

export const taskCrewStartedEvent = event<{
  taskId: string;
  taskTitle: string;
  starterName: string;
  startedAt: string;
  memberIds: string[];
}>('task_crew_started');

export const taskLeadChangedEvent = event<{
  taskId: string;
  taskTitle: string;
  toUserId: string;
  byName: string;
  scope: 'TODAY' | 'PERMANENT';
}>('task_lead_changed');

export const taskLeadNeededEvent = event<{
  taskId: string;
  taskTitle: string;
  recipientIds: string[];
  leaderName: string;
  actingName?: string | null;
}>('task_lead_needed');

export const taskCrewIssueEvent = event<{
  taskId: string;
  taskTitle: string;
  leaderId: string;
  name: string;
  reason: string;
}>('task_crew_issue');

export const tasksPausedEvent = event<
  { taskIds: string[]; userId: string; organizationId: string } & SentNotRead<'reason'>
>('tasks_paused');

export const customerReminderDueEvent = event<{
  organizationId: string;
  userIds?: string[];
  userId?: string;
  customerId: string;
  customerName: string;
  body?: string;
  reminderKind?: string;
  dueAt?: string | null;
}>('customer_reminder_due');

export const credentialExpiringEvent = event<
  {
    documentId: string;
    organizationId: string;
    userId: string;
    userName: string;
    credential: string;
    daysLeft: number;
    expiresOn: string;
    /** Resolved by the producer; falls back to the member alone. */
    recipientIds?: string[];
  } & SentNotRead<'email' | 'title' | 'standing'>
>('credential_expiring');

export const documentIssuedEvent = event<{
  documentId: string;
  userId: string;
  email?: string;
  firstName?: string;
  typeLabel: string;
  title: string;
  needsSignature?: boolean;
}>('document_issued');

export const documentAwaitingSignatureEvent = event<{
  documentId: string;
  userId: string;
  email?: string;
  firstName?: string;
  title: string;
  memberName?: string;
  step?: number;
  totalSteps?: number;
}>('document_awaiting_signature');

export const documentSubmittedEvent = event<{
  documentId: string;
  organizationId: string;
  memberId: string;
  memberName: string;
  typeLabel: string;
  title: string;
  recipientIds?: string[];
}>('document_submitted');

export const documentReviewedEvent = event<
  {
    documentId: string;
    userId: string;
    firstName?: string;
    typeLabel: string;
    accepted: boolean;
    reason?: string | null;
  } & SentNotRead<'email'>
>('document_reviewed');
