/** The report bundle as the server sends it and the web draws it. */
import type { JobTime } from '../job-time';
import type { StepFormAnswerValue, StepFormFieldType } from '../../workflows/step-form';
import type { ClientCopyOption, TaskReportCopy, TaskReportSection } from './sections';

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

/**
 * One company the report may be issued by — for the "Issued by" picker. Only what a
 * picker needs: never a bank account, a tax number or an address.
 */
export interface TaskReportIssuerOption {
  id: string;
  /** The short label when one is set, else the legal name. */
  name: string;
  isMain: boolean;
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
    /** The caller's organization's ACTIVE companies — the "Issued by" choices (id, name, main only). */
    issuers?: TaskReportIssuerOption[];
    /** The company the letterhead is from; null = no company, the organization profile. */
    issuerId?: string | null;
    /** The company the automatic rule picks (workspace → client → main), whatever was chosen. */
    issuerDefaultId?: string | null;
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
