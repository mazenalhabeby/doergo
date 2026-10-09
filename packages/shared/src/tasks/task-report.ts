/**
 * The full report for ONE job — "what happened on this job", start to finish,
 * as one document the office keeps and (in its client copy) hands to the client.
 *
 * Pure: the response TYPES, the section order, and the one rule that turns the
 * office copy into the client copy. Built by task-service (TaskReportService),
 * completed by the gateway (the route), rendered by the web. Browser-safe.
 *
 * ⚠️ THE CLIENT COPY IS MADE ON THE SERVER. `toClientCopy` runs in task-service
 * before the bundle leaves it, and the gateway never adds the route to a client
 * copy — so a client PDF cannot carry a comment, a price or a person's "my
 * issue" because of a rendering bug: the bytes are simply not in the response.
 * The web only ever DRAWS what it was sent.
 *
 * ⚠️ WHITELIST, NEVER BLACKLIST. The client copy is built from the fields it
 * keeps, not by deleting the ones it hides: a field added to the office copy
 * next year is then absent from the client copy until somebody decides it
 * belongs there, instead of leaking into it by default.
 */
import type { StepFormAnswerValue, StepFormFieldType } from '../workflows/step-form';
import type { JobTime } from './job-time';
import { haversineDistance } from '../utils/geofence';

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

// ─── the response ───────────────────────────────────────────────────────────

export interface TaskReportPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface TaskReportStatus {
  key: string;
  name: string;
  color: string | null;
  isFinal: boolean;
  isCanceled: boolean;
}

/** A stored file behind a short-lived signed link (null where storage is not configured). */
export interface TaskReportFile {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  url: string | null;
  createdAt: string;
  by: TaskReportPerson | null;
}

/** Who the document is from: the issuing company (or the organization profile). */
export interface TaskReportIssuer {
  name: string | null;
  logoUrl: string | null;
  addressLines: string[];
  vatId: string | null;
  taxId: string | null;
  registerNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface TaskReportClient {
  id: string;
  name: string;
  type: string;
  /**
   * true = the reader may not open this client in the CRM: the NAME is shown
   * (the job is theirs), the details below are null.
   */
  restricted: boolean;
  legalName: string | null;
  vatId: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface TaskReportContact {
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export interface TaskReportHeader {
  taskId: string;
  /** `#AB12CD` — the same reference the client portal shows. */
  reference: string;
  title: string;
  status: string;
  priority: string;
  issuer: TaskReportIssuer;
  client: TaskReportClient | null;
  contact: TaskReportContact | null;
  site: { address: string | null; lat: number | null; lng: number | null };
  unit: { id: string; name: string; label: string | null; address: string | null; contactName: string | null; contactPhone: string | null } | null;
  asset: { id: string; name: string; serialNumber: string | null; model: string | null; manufacturer: string | null; category: string | null; type: string | null } | null;
  workspace: { id: string; name: string; address: string | null; timezone: string } | null;
  createdAt: string;
  createdBy: TaskReportPerson | null;
  /** Booked / due (carries the hour when one was set — midnight = no hour). */
  dueDate: string | null;
  startedAt: string | null;
  /** Who started it (the first step move, or the office for them). */
  startedBy: TaskReportPerson | null;
  finishedAt: string | null;
  /** The job's type — its workflow's name (Field Service, Inspection…). */
  taskType: string | null;
  /** travel + working + blocked, in minutes, inside shifts (shared job-time.ts). */
  totalMinutes: number;
  lead: TaskReportPerson | null;
  crew: Array<{ person: TaskReportPerson; role: 'LEAD' | 'MEMBER' }>;
  /** The job's flow, for status labels and colours in the history. */
  statuses: TaskReportStatus[];
  /** What part prices are in (workspace → client → company → organization). */
  currency: string;
}

export interface TaskReportRequest {
  description: string | null;
  origin: {
    kind: 'INTERNAL' | 'CUSTOMER_PORTAL' | 'RECURRING' | 'SUBTASK';
    /** CUSTOMER_PORTAL: the request reference the client knows. */
    portalReference: string | null;
    recurringTemplate: { id: string | null; title: string | null } | null;
    parent: { id: string; title: string } | null;
  };
}

/** The service report's words. */
export interface TaskReportWork {
  summary: string;
  workPerformed: string | null;
  customerName: string | null;
  completedAt: string;
  completedBy: TaskReportPerson | null;
}

export interface TaskReportTime {
  asOf: string;
  total: JobTime;
  /** OFFICE ONLY. */
  byPerson?: Array<{ person: TaskReportPerson } & JobTime>;
  /** OFFICE ONLY — "My issue": who stopped, why, and when they carried on. */
  ownStops?: Array<{ person: TaskReportPerson | null; at: string; reason: string | null; resumedAt: string | null }>;
}

export type TaskReportPhotoSource = 'BEFORE' | 'AFTER' | 'TASK' | 'STEP';

export interface TaskReportPhoto extends TaskReportFile {
  source: TaskReportPhotoSource;
  caption: string | null;
  /** STEP: the step it was taken at, and the field it answered. */
  statusKey: string | null;
  fieldLabel: string | null;
}

export interface TaskReportChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  owner: TaskReportPerson | null;
  completedBy: TaskReportPerson | null;
  completedAt: string | null;
}

export interface TaskReportStepAnswer {
  id: string;
  label: string;
  type: StepFormFieldType;
  value: StepFormAnswerValue | null;
  /** photos / signature: the files the answer names, THIS job's own only. */
  files: TaskReportFile[];
}

export interface TaskReportStepSubmission {
  id: string;
  statusKey: string;
  submittedAt: string;
  submittedBy: TaskReportPerson | null;
  fields: TaskReportStepAnswer[];
}

export interface TaskReportPart {
  id: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  notes: string | null;
  /** OFFICE ONLY, in `header.currency`. */
  unitPrice?: number | null;
  /** OFFICE ONLY — quantity × unitPrice. */
  lineTotal?: number | null;
}

/** Added by the GATEWAY (tracking-service), office copy only. */
export interface TaskReportRoute {
  distanceMeters: number | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  pointCount: number;
  points: Array<{ lat: number; lng: number; timestamp: string }>;
  /** Road-snapped geometry when the tracking service had one; else draw `points`. */
  matchedPath: unknown;
  /** From the last recorded point to the job's pin, when both are known. */
  arrivalDistanceMeters: number | null;
}

export interface TaskReportEvent {
  id: string;
  type: string;
  at: string;
  actor: TaskReportPerson | null;
  /** People the event names (EVENT_PERSON_KEYS), resolved. */
  refs: Record<string, TaskReportPerson>;
  data: Record<string, unknown>;
}

export interface TaskReportComment {
  id: string;
  content: string;
  createdAt: string;
  author: TaskReportPerson | null;
}

export interface TaskReportHandover {
  id: string;
  note: string;
  createdAt: string;
  author: TaskReportPerson | null;
  workedMinutes: number | null;
}

export interface TaskReportDetail {
  id: string;
  name: string;
  key: string;
  type: string;
  value: string;
}

export type TaskReportSignatureKind = 'TECHNICIAN' | 'CUSTOMER' | 'STEP';

export interface TaskReportSignature {
  kind: TaskReportSignatureKind;
  /** TECHNICIAN / CUSTOMER: a validated PNG/JPEG data URL. */
  dataUrl: string | null;
  /** STEP: the signed link to the signature image. */
  url: string | null;
  /** Who signed, as written (customer) or the member's name. */
  name: string | null;
  person: TaskReportPerson | null;
  signedAt: string | null;
  statusKey: string | null;
  fieldLabel: string | null;
}

export interface TaskReport {
  meta: {
    copy: TaskReportCopy;
    generatedAt: string;
    /** The sections present, in print order. */
    sections: TaskReportSection[];
    /** The history hit its ceiling; the EARLIEST events are the ones missing. */
    historyTruncated: boolean;
    /** Client copy only: what the office chose to add back (`CLIENT_COPY_OPTIONS`). */
    include?: ClientCopyOption[];
  };
  header: TaskReportHeader;
  request: TaskReportRequest;
  work?: TaskReportWork | null;
  time?: TaskReportTime;
  photos?: TaskReportPhoto[];
  checklist?: TaskReportChecklistItem[];
  stepAnswers?: TaskReportStepSubmission[];
  parts?: TaskReportPart[];
  route?: TaskReportRoute | null;
  history: TaskReportEvent[];
  comments?: TaskReportComment[];
  handovers?: TaskReportHandover[];
  documents?: TaskReportFile[];
  details?: TaskReportDetail[];
  signatures?: TaskReportSignature[];
}

/** Hard ceiling on one report's history (read newest first, in pages). */
export const REPORT_HISTORY_MAX = 5000;

// ─── rules ──────────────────────────────────────────────────────────────────

/** The reference a portal request carries — the client portal and the report say the same. */
export function portalRequestReference(taskId: string): string {
  return `#${String(taskId).slice(-6).toUpperCase()}`;
}

/** A signature image is ~10–200 KB; anything near this is not a signature. */
const SIGNATURE_MAX_CHARS = 2_000_000;
const SIGNATURE_SHAPE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * A stored signature, as the report may pass it on — or null.
 *
 * ⚠️ The column is free text ("base64 encoded PNG or URL"). Only a PNG/JPEG data
 * URL is drawn: a URL would make the PDF fetch from wherever it points, an SVG
 * can carry script, and anything else is not a signature.
 */
export function safeSignatureDataUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > SIGNATURE_MAX_CHARS) return null;
  return SIGNATURE_SHAPE.test(v) ? v : null;
}

/** The sections present in a bundle, in print order. */
export function presentSections(r: Omit<TaskReport, 'meta'> & Partial<Pick<TaskReport, 'meta'>>): TaskReportSection[] {
  return TASK_REPORT_SECTIONS.filter((s) => (r as Record<string, unknown>)[s] !== undefined);
}

function pick(src: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** One history event as the client may read it — or null when it is internal. */
export function clientSafeEvent(e: TaskReportEvent): TaskReportEvent | null {
  const rule = CLIENT_SAFE_EVENTS[e.type];
  if (!rule) return null;
  const refs: Record<string, TaskReportPerson> = {};
  for (const k of rule.refs) if (e.refs[k]) refs[k] = e.refs[k]!;
  return { id: e.id, type: e.type, at: e.at, actor: e.actor, refs, data: pick(e.data, rule.data) };
}

/**
 * The client copy of an office report. See the file header: built from what it
 * KEEPS, so nothing new reaches a client by default.
 */
export function toClientCopy(r: TaskReport, include: readonly ClientCopyOption[] = []): TaskReport {
  const on = new Set(include);
  const out: TaskReport = {
    meta: { ...r.meta, copy: 'client', include: [...on] },
    header: r.header,
    request: r.request,
    history: on.has('fullHistory') ? r.history : r.history.map(clientSafeEvent).filter((e): e is TaskReportEvent => e !== null),
  };
  if (r.work !== undefined) out.work = r.work;
  if (r.time !== undefined) {
    out.time = { asOf: r.time.asOf, total: r.time.total };
    if (on.has('personTime') && r.time.byPerson) out.time.byPerson = r.time.byPerson;
    if (on.has('stopReasons') && r.time.ownStops) out.time.ownStops = r.time.ownStops;
  }
  if (r.photos !== undefined) out.photos = r.photos;
  if (r.checklist !== undefined) out.checklist = r.checklist;
  if (r.stepAnswers !== undefined) out.stepAnswers = r.stepAnswers;
  if (r.parts !== undefined) {
    out.parts = r.parts.map((p) =>
      on.has('partPrices')
        ? p
        : { id: p.id, name: p.name, partNumber: p.partNumber, quantity: p.quantity, notes: p.notes },
    );
  }
  // The route is filled by the gateway after this; keep its slot only when chosen.
  if (on.has('route') && r.route !== undefined) out.route = r.route;
  if (on.has('comments') && r.comments !== undefined) out.comments = r.comments;
  if (on.has('handovers') && r.handovers !== undefined) out.handovers = r.handovers;
  if (r.documents !== undefined) out.documents = r.documents;
  if (r.details !== undefined) out.details = r.details;
  if (r.signatures !== undefined) out.signatures = r.signatures;
  out.meta.sections = presentSections(out);
  return out;
}

/** What tracking-service answers for a task's route (`get_task_route`). */
export interface TrackedTaskRoute {
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  duration?: number | null;
  distance?: number | null;
  points?: Array<{ lat: number; lng: number; timestamp: string | Date }> | null;
  matchedPath?: unknown;
}

/**
 * The tracked route as the report prints it. `arrivalDistanceMeters` is how
 * far the LAST recorded point was from the job's pin — what "arrived" looked
 * like on the map; null when either end is unknown.
 */
export function toReportRoute(raw: TrackedTaskRoute, site: { lat: number | null; lng: number | null }): TaskReportRoute {
  const points = (raw.points ?? [])
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map((p) => ({ lat: p.lat, lng: p.lng, timestamp: new Date(p.timestamp).toISOString() }));
  const last = points[points.length - 1];
  const when = (d: string | Date | null | undefined) => (d == null ? null : new Date(d).toISOString());
  return {
    distanceMeters: typeof raw.distance === 'number' ? raw.distance : null,
    startedAt: when(raw.startTime),
    endedAt: when(raw.endTime),
    durationSeconds: typeof raw.duration === 'number' ? raw.duration : null,
    pointCount: points.length,
    points,
    matchedPath: raw.matchedPath ?? null,
    arrivalDistanceMeters:
      last && site.lat != null && site.lng != null ? Math.round(haversineDistance(last.lat, last.lng, site.lat, site.lng)) : null,
  };
}
