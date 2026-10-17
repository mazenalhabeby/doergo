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

/** The issuing company's letterhead fields — never its bank, never its rates. */
const ISSUER_SELECT = {
  id: true,
  isMain: true,
  legalName: true,
  label: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  city: true,
  state: true,
  country: true,
  vatId: true,
  taxId: true,
  registerNumber: true,
  email: true,
  phone: true,
  website: true,
  logoUrl: true,
  currency: true,
} as const;

/** Events are read newest first, this many per query, up to REPORT_HISTORY_MAX. */
const HISTORY_PAGE = 1000;

type Person = { id: string; firstName: string | null; lastName: string | null };

const personOf = (u: Person | null | undefined): TaskReportPerson | null =>
  u ? { id: u.id, firstName: u.firstName ?? null, lastName: u.lastName ?? null } : null;

const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString());

const nameOf = (p: TaskReportPerson | null) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null);

const isImage = (f: { fileType?: string | null; mimeType?: string | null }) =>
  f.fileType === 'IMAGE' || (typeof f.mimeType === 'string' && f.mimeType.startsWith('image/'));

export { PERSON, REPORT_TASK_SELECT, ISSUER_SELECT, HISTORY_PAGE, Person, personOf, iso, nameOf, isImage };
