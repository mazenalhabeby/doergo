import { type Prisma } from '@prisma/client';
import { type TaskReportPerson } from '@hbcfield/shared';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Exactly what the report renders of the task itself.
 *
 * ⚠️ No rate, no labour cost: `costRateCents`/`billableRateCents` live on the
 * organization, the workspace and the person, and none of them is selected here
 * or anywhere in this file. A report is something a client may be handed.
 */
const REPORT_TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  source: true,
  organizationId: true,
  spaceId: true,
  workflowId: true,
  assignedToId: true,
  openRoleId: true,
  locationAddress: true,
  locationLat: true,
  locationLng: true,
  createdBy: PERSON,
  parent: { select: { id: true, title: true } },
  // `userId` too: the task gate reads it, so asking "is this person on the job?" costs no query.
  assignees: { orderBy: { createdAt: 'asc' }, select: { userId: true, role: true, user: PERSON } },
  customer: {
    select: {
      id: true,
      name: true,
      type: true,
      legalName: true,
      vatId: true,
      address: true,
      email: true,
      phone: true,
      contactName: true,
      ownerId: true,
      managerIds: true,
      currency: true,
      legalEntityId: true,
      // The workspace it is filed in decides a workspace CRM grant (clientReach).
      spaceId: true,
    },
  },
  unit: { select: { id: true, name: true, label: true, address: true, contactName: true, contactPhone: true } },
  asset: {
    select: {
      id: true,
      name: true,
      serialNumber: true,
      model: true,
      manufacturer: true,
      category: { select: { name: true } },
      type: { select: { name: true } },
    },
  },
  space: {
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      enabledModules: true,
      workflowId: true,
      currency: true,
      legalEntityId: true,
    },
  },
  organization: {
    select: {
      name: true,
      enabledModules: true,
      currency: true,
      address: true,
      addressLine1: true,
      addressLine2: true,
      postalCode: true,
      city: true,
      state: true,
      country: true,
      vatId: true,
      email: true,
      phone: true,
      website: true,
      logoUrl: true,
    },
  },
} as const;

/** The issuing company's letterhead fields — auth-service's, published in shared data/companies. */
import { ISSUER_SELECT } from '@hbcfield/shared';

/** Events are read newest first, this many per query, up to REPORT_HISTORY_MAX. */
const HISTORY_PAGE = 1000;

type Person = { id: string; firstName: string | null; lastName: string | null };

const personOf = (u: Person | null | undefined): TaskReportPerson | null =>
  u ? { id: u.id, firstName: u.firstName ?? null, lastName: u.lastName ?? null } : null;

const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString());

const nameOf = (p: TaskReportPerson | null) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null);

const isImage = (f: { fileType?: string | null; mimeType?: string | null }) =>
  f.fileType === 'IMAGE' || (typeof f.mimeType === 'string' && f.mimeType.startsWith('image/'));

/** The task row as REPORT_TASK_SELECT reads it, and one issuing company as ISSUER_SELECT reads it. */
type ReportTask = Prisma.TaskGetPayload<{ select: typeof REPORT_TASK_SELECT }>;
type ReportIssuerRow = Prisma.LegalEntityGetPayload<{ select: typeof ISSUER_SELECT }>;

/*
  What each report section reads from the reads it composes — stated by shape, so a
  section asks only for the fields it prints.
*/
type When = Date | string | null | undefined;
type ReportFileRow = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  url?: string | null;
  createdAt?: When;
};
type ReportChecklistRow = {
  id: string;
  text: string;
  isCompleted?: boolean | null;
  assignee?: Person | null;
  completedBy?: Person | null;
  completedAt?: When;
};
type ReportSubmissionRow = {
  id: string;
  statusKey: string;
  form: unknown;
  answers?: unknown;
  files?: unknown;
  submittedAt: When;
  submittedBy?: Person | null;
};
type ReportDetailRow = {
  definitionId: string;
  value: unknown;
  definition?: { name?: string | null; key?: string | null; type?: string | null } | null;
};

export { PERSON, REPORT_TASK_SELECT, ISSUER_SELECT, HISTORY_PAGE, Person, personOf, iso, nameOf, isImage };
export type { ReportTask, ReportIssuerRow, ReportFileRow, ReportChecklistRow, ReportSubmissionRow, ReportDetailRow };
