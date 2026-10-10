import { orgsApi } from './api/endpoints';

/*
  The organization's off switch — ONE copy of its consequence warning, for the
  row and the drawer alike (two copies drift, and the stale one is the one
  somebody reads).

  Deactivating refuses sign-in, refresh and every request; nothing is deleted
  and no bill changes. The confirmation says both halves, because the fear that
  stops an operator using a switch like this is that it might not be reversible.
*/
export function toggleActiveAction(o: { id: string; name: string; suspendedAt: string | null }): (() => Promise<unknown>) | null {
  const deactivating = !o.suspendedAt;
  const ok = window.confirm(
    deactivating
      ? `Deactivate ${o.name}?\n\nEveryone in this organization is signed out within about a minute and cannot sign back in. Nothing is deleted and no bill changes — reactivating restores them exactly as they were.`
      : `Reactivate ${o.name}?\n\nMembers can sign in again straight away.`,
  );
  if (!ok) return null;
  return () => (deactivating ? orgsApi.suspend(o.id) : orgsApi.reactivate(o.id));
}
