import { portalOfficeApi, type OfficeRequest } from '../../lib/api';

/** A request as the list holds it — with the workspace of the portal it came through. */
export type ListedRequest = OfficeRequest & { portalId: string; portalSpaceId: string };

/**
 * The last list read, by request id — so opening a request draws at once
 * instead of reading the whole portal again. A detail opened by link reads
 * its portal itself (`requestsOfPortal`).
 */
const known = new Map<string, ListedRequest>();

export function knownRequest(id: string): ListedRequest | null {
  return known.get(id) ?? null;
}

/** Every request of every portal in these workspaces, waiting ones first, newest first. */
export async function requestsOfSpaces(spaceIds: string[]): Promise<ListedRequest[]> {
  const perSpace = await Promise.all(spaceIds.map(async (spaceId) => {
    const portals = await portalOfficeApi.portals(spaceId).catch(() => []);
    const lists = await Promise.all(portals.map(async (p) =>
      (await portalOfficeApi.requests(p.id).catch(() => [])).map((r) => ({ ...r, portalId: p.id, portalSpaceId: spaceId }))));
    return lists.flat();
  }));
  const all = perSpace.flat().sort((a, b) =>
    Number(a.triaged) - Number(b.triaged) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  for (const r of all) known.set(r.id, r);
  return all;
}

export async function requestsOfPortal(portalId: string, spaceId: string): Promise<ListedRequest[]> {
  const rows = (await portalOfficeApi.requests(portalId)).map((r) => ({ ...r, portalId, portalSpaceId: spaceId }));
  for (const r of rows) known.set(r.id, r);
  return rows;
}

export { stageOf, type RequestStage } from './request-stage';
