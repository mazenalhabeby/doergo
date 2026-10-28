import { call, E } from './client';

/**
 * A workspace's client requests, as the people running it read them.
 *
 * The other side of `portalApi` (the RESIDENT's own requests). Reading needs
 * `canViewPortal` in the portal's workspace, turning one into a job needs
 * `canAnswerPortal` there — both decided and narrowed by the server; a portal
 * outside the caller's workspaces answers 404.
 */

export interface OfficePortal {
  id: string;
  name: string;
  spaceId?: string | null;
}

export interface OfficeRequest {
  id: string;
  /** `#AB12CD` — what the resident sees on their copy. */
  reference: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  /** false = waiting for somebody to turn it into a job. */
  triaged: boolean;
  unitName: string | null;
  unitAddress: string | null;
  customerName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  assignedToId: string | null;
  createdAt: string;
  /** The status steps of the job it became; a finished one has every step done. */
  timeline: { label: string; state: 'done' | 'active' | 'pending' }[];
}

export interface TriageInput {
  spaceId: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assignedToId?: string | null;
}

export const portalOfficeApi = {
  portals: async (spaceId: string): Promise<OfficePortal[]> => {
    const res = await call(E.spacePortal.listPortals, { spaceId });
    return Array.isArray(res) ? (res as OfficePortal[]) : [];
  },

  requests: async (portalId: string): Promise<OfficeRequest[]> => {
    const res = await call(E.portalAdmin.portalRequests, { portalId });
    return Array.isArray(res) ? (res as OfficeRequest[]) : [];
  },

  /**
   * Every request across the portals the caller reads, in ONE read, each with its portal and the portal's workspace.
   * `null` when the server has no such route yet (before the 2026-10-28 deploy) — the caller then reads per portal.
   */
  allRequests: async (): Promise<(OfficeRequest & { portalId: string; portalSpaceId: string | null })[] | null> => {
    try {
      const res = await call(E.portalAdmin.allRequests);
      return Array.isArray(res) ? (res as (OfficeRequest & { portalId: string; portalSpaceId: string | null })[]) : [];
    } catch (e) {
      if ((e as { status?: number })?.status === 404) return null;
      throw e;
    }
  },

  /** Turn a waiting request into a job in this workspace. The workflow is the workspace's own. */
  triage: (requestId: string, input: TriageInput): Promise<unknown> =>
    call(E.portalAdmin.triageRequest, { requestId }, { body: input }),
};
