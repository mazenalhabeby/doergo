/** The two copies, the section order, what the client copy hides and may add back, which events it keeps. */

// ─── copies and sections ────────────────────────────────────────────────────

export const REPORT_COPIES = ['office', 'client'] as const;

export type TaskReportCopy = (typeof REPORT_COPIES)[number];

/** `?copy=` as a client sends it: absent = the office copy; anything unknown = null (400). */
export function parseReportCopy(v: unknown): TaskReportCopy | null {
  if (v === undefined || v === null || v === '') return 'office';
  return typeof v === 'string' && (REPORT_COPIES as readonly string[]).includes(v) ? (v as TaskReportCopy) : null;
}

export const REPORT_COPY_INVALID = 'REPORT_COPY_INVALID';

export const REPORT_NOT_FINISHED = 'REPORT_NOT_FINISHED';

/** `?issuer=` named something that is not one of the caller's organization's ACTIVE companies. */
export const REPORT_ISSUER_INVALID = 'REPORT_ISSUER_INVALID';

/**
 * The steps that FINISH a job: its flow's final steps that are not a cancel —
 * whatever the flow calls them ("Completed", "Done", "Delivered"). No flow = the
 * built-in COMPLETED / CLOSED. One rule for the report's gate, its "finished"
 * time and the button that offers it.
 */
export function finishedStatusKeys(statuses: ReadonlyArray<{ key: string; isFinal?: boolean | null; isCanceled?: boolean | null }>): Set<string> {
  return statuses.length
    ? new Set(statuses.filter((s) => s.isFinal && !s.isCanceled).map((s) => s.key))
    : new Set(['COMPLETED', 'CLOSED']);
}

export function isJobFinished(
  status: string | null | undefined,
  statuses: ReadonlyArray<{ key: string; isFinal?: boolean | null; isCanceled?: boolean | null }>,
): boolean {
  return !!status && finishedStatusKeys(statuses).has(status);
}

/**
 * The sections, in the order the document prints them. Each key is also the
 * report's property of that name; `meta.sections` lists the ones PRESENT.
 * Absent = switched off in the workspace (a module), hidden from this copy, or
 * (route) not visible to this reader.
 */
export const TASK_REPORT_SECTIONS = [
  'header',
  'request',
  'work',
  'time',
  'photos',
  'checklist',
  'stepAnswers',
  'parts',
  'route',
  'history',
  'comments',
  'handovers',
  'documents',
  'details',
  'signatures',
] as const;

export type TaskReportSection = (typeof TASK_REPORT_SECTIONS)[number];

/**
 * The workspace module a section needs, where the job page needs one. A section
 * not named here is always present. Photos and signatures are MIXED (a report
 * photo needs service_reports, a task photo attachments, a step-form photo
 * nothing) — the service gates each source on its own module.
 */
export const REPORT_SECTION_MODULE: Partial<Record<TaskReportSection, string>> = {
  work: 'service_reports',
  parts: 'service_reports',
  checklist: 'checklists',
  documents: 'attachments',
  details: 'custom_fields',
  route: 'tracking',
};

/** What the client copy leaves out — the decision, written down once. */
export const CLIENT_COPY_HIDDEN = {
  /** Whole sections. */
  sections: ['route', 'comments', 'handovers'] as const,
  /** Per-person time and a person's own stops ("My issue"); the totals stay. */
  time: ['byPerson', 'ownStops'] as const,
  /** What a part cost; its name, number and quantity stay. */
  parts: ['unitPrice', 'lineTotal'] as const,
} as const;

/**
 * What the person making a client copy may ADD back, one switch each. Every one
 * is OFF by default (`CLIENT_COPY_HIDDEN` is that default); the office chooses per
 * report, and the server still cuts everything not chosen — the choice travels as
 * `?include=`, it never widens what the reader could see in the office copy.
 */
export const CLIENT_COPY_OPTIONS = ['personTime', 'stopReasons', 'partPrices', 'route', 'comments', 'handovers', 'fullHistory'] as const;

export type ClientCopyOption = (typeof CLIENT_COPY_OPTIONS)[number];

export const REPORT_INCLUDE_INVALID = 'REPORT_INCLUDE_INVALID';

/**
 * `?include=` as a client sends it: comma-separated or repeated. Absent = none.
 * Anything unknown = null (400) — a typo must not silently print less, or more.
 */
export function parseClientCopyInclude(v: unknown): ClientCopyOption[] | null {
  if (v === undefined || v === null || v === '') return [];
  const parts = (Array.isArray(v) ? v : [v]).flatMap((x) => (typeof x === 'string' ? x.split(',') : [x]));
  const out = new Set<ClientCopyOption>();
  for (const p of parts) {
    const k = typeof p === 'string' ? p.trim() : p;
    if (k === '') continue;
    if (typeof k !== 'string' || !(CLIENT_COPY_OPTIONS as readonly string[]).includes(k)) return null;
    out.add(k as ClientCopyOption);
  }
  return [...out];
}

/**
 * The history a client may read, and of each event the facts they may read.
 * Everything else is internal — role-pool offers, edits with their diffs,
 * comments, handover notes, checklist hand-offs, lead changes, pauses — and so
 * is every REASON (a block, a pause, a leave, an office start), which is why the
 * data is a whitelist per type rather than the stored metadata minus a list.
 *
 * `refs` = the metadata keys that name a person (resolved to a name).
 */
export const CLIENT_SAFE_EVENTS: Readonly<Record<string, { data: readonly string[]; refs: readonly string[] }>> = {
  CREATED: { data: ['source', 'templateTitle'], refs: [] },
  ASSIGNED: { data: [], refs: ['workerId'] },
  ASSIGNEE_ADDED: { data: ['role'], refs: ['assigneeId'] },
  STATUS_CHANGED: { data: ['oldStatus', 'newStatus', 'occurredAt'], refs: [] },
  CREW_JOINED: { data: [], refs: [] },
  CREW_LEFT: { data: [], refs: [] },
};

export const CLIENT_SAFE_EVENT_TYPES: readonly string[] = Object.keys(CLIENT_SAFE_EVENTS);

/**
 * Metadata keys that hold a USER id, resolved to a person on every event that
 * carries one (`event.refs[key]`). One list so the service resolves all of them
 * in a single query.
 */
export const EVENT_PERSON_KEYS = [
  'workerId',
  'previousWorkerId',
  'assigneeId',
  'forUserId',
  'byUserId',
  'from',
  'to',
] as const;
