/** The built-in roles every organization starts with. */
import { PERMISSION_KEYS, type PermissionSet } from './keys';

/** Role scope — mirrors the Prisma `RoleScope` enum. */
export type RoleScope = 'ORG' | 'SPACE' | 'BOTH';

/** A built-in role definition (seeded per org, editable, non-deletable). */
export interface RolePreset {
  slug: string;
  name: string;
  description: string;
  color: string;
  scope: RoleScope;
  permissions: PermissionSet;
}

const allPermissions = (): PermissionSet => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionSet;

/**
 * The role an external member gets in their space when nobody picks one.
 *
 * An external invitation carries no org-wide role — the server refuses that
 * combination — and the invite form offered no space role either, so an
 * external member arrived holding NOTHING: they could sign in, and every
 * supervisor surface was gated on permissions they did not have. The screen was
 * empty and correct, which is the hardest kind of empty to diagnose.
 *
 * This role exists for exactly this person, so it is the default rather than a
 * question. Chosen by SLUG, never by name: the name is editable per
 * organization and translations of it exist.
 *
 * Only ever a DEFAULT. An explicitly chosen role always wins, and an assignment
 * that already has a role is never overwritten.
 */
export const EXTERNAL_DEFAULT_ROLE_SLUG = 'external-supervisor';

/**
 * Built-in roles seeded once per organization. Space slugs (space-manager,
 * shift-leader, team-leader) deliberately match the legacy `SpaceRole` built-ins
 * so backfill MERGES them rather than duplicating.
 */
export const BUILTIN_ROLES: RolePreset[] = [
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Organization owner — full control',
    color: '#1e293b',
    scope: 'ORG',
    permissions: allPermissions(),
  },
  {
    slug: 'manager',
    name: 'Manager',
    description: 'Org-wide manager under the admin. Handles all spaces with the permissions the admin grants.',
    color: '#2563eb',
    scope: 'ORG',
    permissions: {
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
      canViewReports: true,
      canApproveOvertime: true,
      canViewSpaceAttendance: true,
    },
  },
  /*
    Sales — a rep who owns a book of clients and works it.

    ORG scope, and that is load-bearing rather than a default: `resolveCrmCaps`
    reads the CRM keys off the member's ORG role (`memberRoleId`) only, so a
    SPACE-scoped sales role would resolve to no CRM access at all — a role that
    grants nothing, on a screen that shows it granted.

    `crmViewOwn` rather than `crmViewAll` is the whole shape of the job: a rep
    sees the clients assigned to them, and the server scopes the query rather
    than the page hiding rows. They work those clients — move the stage, add
    notes, keep the details right — and book the calls and visits as tasks.

    ⚠️ `canViewAllTasks` is deliberately ABSENT and must stay absent. It is not
    only about tasks: `resolveCrmCaps` reads it as the legacy "read the whole
    client book", so adding it here to let a rep see the team's jobs would
    silently hand them every client in the organization. That is the one edit to
    this role that looks harmless and is not, which is why a test asserts it.

    Adding a client IS a rep's act — they are the ones holding the business
    card — so `crmCreateClients` is here. Reassigning somebody else's client and
    deleting one are not, so `crmManageClients` is not. A sales LEAD is the
    existing Manager role, which reaches full CRM through the same resolver.
  */
  {
    slug: 'sales-rep',
    name: 'Sales Rep',
    description: 'Owns their assigned clients: works the pipeline, keeps details current, books calls and visits',
    color: '#7c3aed',
    scope: 'ORG',
    permissions: {
      crmViewOwn: true,
      crmWork: true,
      crmEditInfo: true,
      // Adds the clients they meet; still cannot delete or reassign one.
      crmCreateClients: true,
      canCreateTasks: true,
    },
  },
  {
    slug: 'space-manager',
    name: 'Space Manager',
    description: 'Full authority within their assigned space(s) — incl. managing members',
    color: '#2563eb',
    scope: 'SPACE',
    permissions: {
      canManageUsers: true, // manages members + routing WITHIN this space (delegation)
      canAddSpaceMembers: true,
      canGrantSpaceRoles: true,
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canApproveOvertime: true,
      canManageRota: true,
      canReconcileAttendance: true,
      canApproveAttendance: true,
      canDeleteAttendance: true,
      canViewSpaceAttendance: true,
      canViewAssets: true,
    },
  },
  {
    slug: 'shift-leader',
    name: 'Shift Leader',
    description: 'Approves overtime and reconciles open shifts in their space',
    color: '#16a34a',
    scope: 'SPACE',
    permissions: {
      canApproveOvertime: true,
      canReconcileAttendance: true,
      canApproveAttendance: true,
      canDeleteAttendance: true,
      canViewSpaceAttendance: true,
    },
  },
  {
    slug: 'team-leader',
    name: 'Team Leader',
    description: 'Approves overtime for their team in their space',
    color: '#ca8a04',
    scope: 'SPACE',
    permissions: {
      canApproveOvertime: true,
      canViewSpaceAttendance: true,
    },
  },
  /*
    The client's own supervisor — an EXTERNAL member's role.

    Every permission here is inside `EXTERNAL_ALLOWED_PERMISSIONS`, so it can
    never trip the ceiling: an admin picking this one for somebody who works for
    a client gets a grant that succeeds, instead of discovering by refusal which
    of sixteen checkboxes made Space Manager illegal.

    It differs from Shift Leader by `canViewAllTasks`, and that is the whole
    point of it rather than an accident: a client's supervisor stands ON the
    site. They approve our hours AND watch the work those hours were spent on,
    which is more of the day than an internal shift leader needs and strictly
    less of the organization — no members, no clients, no documents, no
    tracking, and nothing at all outside the one space they are assigned to.

    Available to anyone; nothing binds it to `isExternal`. A role that only
    appears for certain people is a rule hidden in a dropdown, and the real rule
    already lives on the server where it can refuse.
  */
  /*
    The other kind of outsider: one who WATCHES.

    A client rep who follows the job and raises a fault, and does nothing else.
    They read their space's board — the workflow IS the process, so status and
    progress come free — and they can open a task. They cannot assign it, cannot
    approve anything, and never see an hour: no attendance, no rota, no
    overtime. The Time & Attendance menu does not appear for them at all,
    because it is gated on permissions they simply do not hold, rather than
    hidden by a rule that could be forgotten.

    Signing is deliberately absent from this list and still works. A signature
    is authorised by being NAMED on the document — the signer chain — never by a
    permission, so a document routed to the client's representative reaches them
    whichever external role they hold. Gating signing on a permission would
    break that chain; it must stay outside this set.

    Both permissions are inside EXTERNAL_ALLOWED_PERMISSIONS, so the grant
    cannot trip the ceiling.
  */
  {
    slug: 'external-observer',
    name: 'External Observer',
    description: "A client's representative who follows the work and can raise a job — no hours, no approvals, no assigning",
    // The same amber as the External badge and the supervisor role: one colour
    // for everyone who does not work here.
    color: '#b45309',
    scope: 'SPACE',
    permissions: {
      canViewAllTasks: true,
      canCreateTasks: true,
    },
  },
  {
    slug: 'external-supervisor',
    name: 'External Supervisor',
    description: "A client's or partner's supervisor: approves our hours and follows the work, in one space only",
    // The amber the External badge uses, so the role and the person carry one
    // colour wherever either appears.
    color: '#b45309',
    scope: 'SPACE',
    /*
      Signs off our hours; does not rewrite them. Correcting (canReconcileAttendance)
      and deleting (canDeleteAttendance) are switches an admin turns on for one
      person in the builder. An organization seeded before the split keeps what its
      copy of this role already held — built-ins only ever gain keys.
    */
    permissions: {
      canViewSpaceAttendance: true,
      canApproveAttendance: true,
      canApproveOvertime: true,
      canViewAllTasks: true,
    },
  },
];
