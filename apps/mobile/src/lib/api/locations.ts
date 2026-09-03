/**
 * Locations API — company locations (spaces) and member assignments.
 * Mirrors the web `locationsApi` surface used by the admin dashboard.
 */
import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';
import type { CompanyLocation } from './types';

/** A location plus its active member assignments (from the list endpoint). */
export type LocationWithMembers = CompanyLocation & {
  assignments?: { userId: string; isPrimary?: boolean }[];
};

export interface LocationAssignment {
  id: string;
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string | null;
    workMode?: string;
  };
}

export interface AssignMemberInput {
  userId: string;
  isPrimary?: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
}

export const locationsApi = {
  list: async (params?: { includeInactive?: boolean; limit?: number }): Promise<LocationWithMembers[]> => {
    const endpoint = buildUrlWithQuery('/locations', {
      includeInactive: params?.includeInactive,
      limit: params?.limit ?? 200,
    });
    const result = await fetchWithAuth<any>(endpoint);
    return Array.isArray(result) ? result : result?.data || [];
  },

  create: async (data: { name: string; address?: string; lat?: number; lng?: number }): Promise<CompanyLocation> => {
    return fetchWithAuth<CompanyLocation>('/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Rosters for several spaces in ONE request — the people, not just their ids.
   *
   * `/locations` embeds each space's assignments as bare user ids, and the
   * member directory (`/organizations/members`) is an ORG-wide read: a member
   * whose authority comes from a SPACE is refused it, so their own space's
   * board came back with nobody on it. This endpoint answers with the people,
   * scoped server-side to the spaces the caller may actually see.
   */
  getRosters: async (locationIds: string[]): Promise<LocationAssignment[]> => {
    if (locationIds.length === 0) return [];
    const result = await fetchWithAuth<any>(`/locations/rosters?ids=${locationIds.join(',')}`);
    return Array.isArray(result) ? result : result?.data || [];
  },

  getAssignedMembers: async (locationId: string): Promise<LocationAssignment[]> => {
    const result = await fetchWithAuth<any>(`/locations/${locationId}/members`);
    return Array.isArray(result) ? result : result?.data || [];
  },

  assignMember: async (locationId: string, data: AssignMemberInput): Promise<LocationAssignment> => {
    return fetchWithAuth<LocationAssignment>(`/locations/${locationId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeMember: async (locationId: string, assignmentId: string): Promise<void> => {
    await fetchWithAuth<any>(`/locations/${locationId}/members/${assignmentId}`, {
      method: 'DELETE',
    });
  },
};
