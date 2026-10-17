/** Moved here unchanged from types.ts. */

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
  unit: {
    id: string;
    name: string;
    label: string | null;
    address: string | null;
    contactName: string | null;
    contactPhone: string | null;
  } | null;
  asset: {
    id: string;
    name: string;
    serialNumber: string | null;
    model: string | null;
    manufacturer: string | null;
    category: string | null;
    type: string | null;
  } | null;
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
