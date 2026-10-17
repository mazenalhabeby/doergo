/** CRM abilities, resolved from role and flags, and who owns a client. */
import type { PermissionSet } from './keys';

/** Resolved CRM abilities for a caller — what the customers service enforces. */
export type CrmViewScope = 'none' | 'own' | 'all';

export interface CrmCaps {
  view: CrmViewScope; // 'none' = no CRM access at all
  work: boolean; // change stage + add notes
  editInfo: boolean; // edit details/addresses/units
  /**
   * May add a client. Separate from `manage` because adding one and deleting
   * one are not the same power: a rep who collects a business card should be
   * able to enter it without also being able to remove somebody else's client.
   */
  create: boolean;
  manage: boolean; // reassign, delete/archive — and implies create
  canAccess: boolean; // convenience: view !== 'none'
}

/**
 * Resolve a caller's effective CRM abilities from their role. ADMIN gets full
 * access. Everyone else is driven by the CRM permission keys on their role's
 * PermissionSet. Single source of truth for client + server so they can't drift.
 */
export function resolveCrmCaps(
  systemRole: string | null | undefined,
  permissions: PermissionSet | null | undefined,
  opts: {
    /**
     * Read canManageUsers / canViewAllTasks as CRM keys (the default). FALSE for
     * a WORKSPACE's permission set (crm/crm-reach.ts): every space manager and
     * every external supervisor holds those two in their workspace, and the
     * bridge would hand each of them that workspace's whole client book.
     */
    legacyBridge?: boolean;
  } = {},
): CrmCaps {
  if (systemRole === 'ADMIN') {
    return { view: 'all', work: true, editInfo: true, create: true, manage: true, canAccess: true };
  }
  const p = permissions ?? {};
  const bridge = opts.legacyBridge !== false;
  // Backward-compat bridge: before CRM caps existed, CRM read = canViewAllTasks and
  // CRM write = canManageUsers. Keep those working so existing manager roles don't
  // lose access the moment this ships (they gain the granular keys only when an
  // admin edits the role). New crm* keys are additive on top.
  const legacyManage = bridge && !!p.canManageUsers; // full CRM writer (manager)
  const legacyViewAll = bridge && !!p.canViewAllTasks; // read-only CRM (see everything)
  const work = !!p.crmWork || legacyManage;
  const editInfo = !!p.crmEditInfo || legacyManage;
  const manage = !!p.crmManageClients || legacyManage;
  // Managing implies adding — a role that can delete a client can obviously
  // create one, and every existing role keeps working without being re-edited.
  const create = !!p.crmCreateClients || manage;
  let view: CrmViewScope = p.crmViewAll || legacyManage || legacyViewAll ? 'all' : p.crmViewOwn ? 'own' : 'none';
  // Any granted CRM action implies being able to SEE the clients it acts on:
  // managing implies the whole book, working/editing implies at least your own.
  // (So ticking "Manage clients" alone still grants access — no silent dead end.)
  if (view === 'none') {
    if (manage) view = 'all';
    else if (work || editInfo || create) view = 'own';
  }
  return { view, work, editInfo, create, manage, canAccess: view !== 'none' };
}

/** Does this caller own (or co-manage) a client? Owner or a listed manager. */
export function ownsClient(client: { ownerId?: string | null; managerIds?: string[] | null }, userId: string): boolean {
  return client.ownerId === userId || (client.managerIds ?? []).includes(userId);
}
