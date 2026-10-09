import { ownsClient, resolveCrmCaps, type CrmCaps, type PermissionSet } from '../types/permissions';

/**
 * May this member reach this client? The CRM's own rule (auth-service
 * `CustomersService.crmCapsFor` + `canReach`), for a service that is not the
 * CRM but shows a client's name — the calendar puts one on an event.
 *
 * "Reads the client book" is not the same thing: a rep with own-scope CRM
 * reads THEIR clients, and an event they were invited to by another rep must
 * not hand them the name of a client they cannot open.
 */
export const CRM_CAPS_SELECT = { role: true, memberRole: { select: { permissions: true } } } as const;

export interface CrmCapsRow {
  role: string;
  memberRole?: { permissions: unknown } | null;
}

/** The member's CRM abilities from their row — the same inputs the CRM reads. */
export function crmCapsOfRow(row: CrmCapsRow | null | undefined): CrmCaps {
  if (!row) return resolveCrmCaps(null, {});
  return resolveCrmCaps(row.role, (row.memberRole?.permissions as PermissionSet | null) ?? {});
}

/** All-scope reaches every client; own-scope the ones they own or co-manage; nobody else any. */
export function crmReachesClient(
  caps: CrmCaps,
  client: { ownerId?: string | null; managerIds?: string[] | null },
  userId: string,
): boolean {
  if (caps.view === 'all') return true;
  if (caps.view === 'own') return ownsClient(client, userId);
  return false;
}
