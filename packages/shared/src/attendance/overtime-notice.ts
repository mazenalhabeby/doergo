/**
 * The pushes the overtime-request flow sends (task-service `OvertimeService`),
 * as catalogue references rather than sentences.
 *
 * They used to be emitted as `push_notification` with an English title and
 * body — an event nothing in notification-service listens to, so they reached
 * nobody, and had they arrived they would have reached a German phone in
 * English. A notice now names WHAT happened (`kind`) and the facts to put in
 * it; the notification service renders `overtime.<kind>.title` / `.body` in
 * each recipient's language, as it does for every other push.
 *
 * `data.type` is unchanged from the old payload, so a phone's tap routing reads
 * the same field it always did.
 */
export const OVERTIME_NOTICE_EVENT = 'overtime_notice' as const;

export const OVERTIME_NOTICE_KINDS = [
  /** To the routed approvers: a member asks for overtime. `{ name, location }` */
  'approvalRequest',
  /** To the person who signed on a colleague's phone: confirm it from yours. */
  'confirmSignature',
  /** To the member: refused, you were clocked out. `{ reason }` (written by a person — verbatim) */
  'rejected',
  /** To the member: clocked out, you did not answer the prompt. */
  'expiredPrompt',
  /** To the member: clocked out, nobody approved in time. */
  'expiredApproval',
] as const;

export type OvertimeNoticeKind = (typeof OVERTIME_NOTICE_KINDS)[number];

export interface OvertimeNotice {
  recipientIds: string[];
  organizationId: string;
  kind: OvertimeNoticeKind;
  params: { name?: string; location?: string; reason?: string };
  /** Tap routing on the phone — the same `type` values the old payload carried. */
  data: { type: string; overtimeRequestId?: string; action?: string };
}

/** The push catalogue keys a notice renders through. */
export const overtimeNoticeKeys = (kind: OvertimeNoticeKind) =>
  ({ title: `overtime.${kind}.title`, body: `overtime.${kind}.body` }) as const;
