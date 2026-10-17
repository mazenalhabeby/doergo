/**
 * Event payloads that are more than a line — moved here from notification-service
 * (the handler file keeps the old name as an alias) or written from what an
 * untyped (`any`) handler actually reads.
 */

/**
 * A task as the services send it. Open screens get it whole (websocket emits),
 * so every other field rides along — the index signature says so.
 */
export interface EventTask {
  id: string;
  title: string;
  organizationId?: string;
  createdById?: string;
  assignedToId?: string | null;
  [field: string]: unknown;
}

export interface ExpenseSubmittedEvent {
  organizationId: string;
  entryId: string;
  assetId: string;
  assetName: string;
  spaceId?: string | null;
  authorId: string;
  authorName?: string;
  category: string;
  amountCents: number;
  occurredAt: string | Date;
  recipientIds: string[];
}

export interface ExpenseDecidedEvent {
  organizationId: string;
  entryId: string;
  assetId: string;
  assetName: string;
  authorId: string;
  decision: 'accept' | 'reject';
  note?: string | null;
  amountCents: number;
  category: string;
}

export interface HandedOverEvent {
  organizationId: string;
  assetId: string;
  assetName: string;
  openedUserIds: string[];
  closedUserIds: string[];
  byUserId: string;
  at: string | Date;
}

/** calendar_invited / _updated / _canceled. */
export interface CalendarEventFacts {
  organizationId: string;
  eventId: string;
  title: string;
  startAt: string;
  allDay?: boolean;
  timezone?: string;
  organizerName?: string;
  userIds: string[];
}

// Payload for every geofence_excursion_* event emitted by task-service.
export interface GeofenceExcursionEvent {
  excursionId: string;
  status: string;
  userId: string;
  userName: string;
  userEmail?: string;
  spaceId: string;
  spaceName: string;
  reason?: string | null;
  requestedMinutes?: number | null;
  grantedMinutes?: number | null;
  /** task-service sends a Date; it arrives as its ISO string. */
  expiresAt?: string | Date | null;
  distanceM?: number | null;
  watcherIds?: string[];
  watcherEmails?: string[];
  organizationId: string;
}

/** One thing due on an asset (the handler re-checks the shape: the list may be empty or missing). */
export interface AssetLogDueItem {
  logType: string;
  label: string;
  stage: 'soon' | 'overdue';
  daysLeft: number | null;
  unitsLeft: number | null;
  unit: string | null;
}

export interface AssetLogDueMessage {
  recipientIds?: string[];
  items?: Array<AssetLogDueItem & SentNotRead<'dueAt' | 'dueReading' | 'reading'>>;
  assetId: string;
  assetName?: string | null;
  /** Sent, not read by the handler. */
  organizationId?: string;
}

export interface AssetProposalRaisedMessage {
  proposalId: string;
  recipientIds?: string[];
  raisedById: string;
  raiserName?: string | null;
  name?: string | null;
  /** Sent, not read by the handler. */
  organizationId?: string;
}

/** Forwarded whole to the member's open screens (asset_proposal.decided). */
export interface AssetProposalDecidedMessage {
  proposalId: string;
  userId?: string;
  outcome?: string;
  detail?: string | null;
  [field: string]: unknown;
}

export interface ShiftIssueCreatedMessage {
  issueId: string;
  title?: string;
  severity?: string;
  reporterId: string;
  reporterName?: string | null;
  recipientIds?: string[];
  /** Sent, not read by the handler. */
  organizationId?: string;
}

export interface ShiftIssueEventMessage {
  issueId: string;
  title?: string;
  actorId: string;
  actorName?: string | null;
  recipientIds?: string[];
  /** The thread event; the handler reads type, body and metadata (the rest rides along). */
  event?: {
    type?: string;
    body?: string | null;
    metadata?: Record<string, unknown> | null;
    [field: string]: unknown;
  } | null;
  /** Sent, not read by the handler. */
  organizationId?: string;
  severity?: string;
  status?: string;
}

export interface TaskDepartureDueMessage {
  taskId: string;
  userId: string;
  title: string;
  dueDate: string | Date;
  travelMinutes: number;
  estimated: boolean;
  /** Sent, not read by the handler. */
  organizationId?: string;
  leaveAt?: string;
}

export interface TaskAssignedMessage {
  task: EventTask;
  workerId: string;
  actorId?: string | null;
  watcherIds?: string[];
}

export interface TaskStatusChangedMessage {
  task: EventTask;
  oldStatus: string;
  newStatus: string;
  actorId?: string | null;
  watcherIds?: string[];
}

export interface CommentAddedMessage {
  taskId: string;
  task?: EventTask | null;
  comment: {
    userId?: string;
    user?: { firstName?: string | null; lastName?: string | null } | null;
    [field: string]: unknown;
  };
}

/** What a request that is not leave asks for (time_off_requested / _decided). */
export interface TimeOffRequestFacts {
  kind?: string | null;
  spaceName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  minutes?: number | null;
}

/**
 * Fields an emitter sends that the handler never reads. They stay on the wire as
 * they are (no behaviour change, CODE_AUDIT.md §12) — typed so the gap is visible.
 */
export type SentNotRead<K extends string> = { [F in K]?: unknown };
