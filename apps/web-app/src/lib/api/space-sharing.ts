import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  CreateSpaceShareInput,
  SharedSpace,
  SpaceShare,
  SpaceShareRequest,
  SpaceShareRequestType,
  UpdateSpaceShareInput
} from './types/space-sharing';
import { spaceSharingWebEndpoints } from '@hbcfield/shared/client';

export const spaceSharingApi = {
  // ── Owner side ────────────────────────────────────────────────────────────
  /** List every share the owner has created on a space. */
  listShares: async (spaceId: string): Promise<SpaceShare[]> => {
    const res = await call(spaceSharingWebEndpoints.listShares, { spaceId }) as ApiResponse<{ data: SpaceShare[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  /** Invite a guest org (resolved by its secret join/share code) → PENDING share. */
  createShare: async (spaceId: string, input: CreateSpaceShareInput): Promise<SpaceShare> => {
    const res = await call(spaceSharingWebEndpoints.createShare, { spaceId }, { body: input }) as ApiResponse<{ data: SpaceShare }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  updateShare: async (spaceId: string, shareId: string, input: UpdateSpaceShareInput): Promise<SpaceShare> => {
    const res = await call(
      spaceSharingWebEndpoints.updateShare,
      { spaceId, shareId },
      { body: input }) as ApiResponse<{ data: SpaceShare }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  /** Revoke a share. */
  revokeShare: async (spaceId: string, shareId: string): Promise<void> => {
    const res = await call(spaceSharingWebEndpoints.revokeShare, { spaceId, shareId }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },
  /** Incoming "request more" requests raised by guests on a space the owner owns. */
  listShareRequests: async (spaceId: string, status = 'PENDING'): Promise<SpaceShareRequest[]> => {
    const res = await call(
      spaceSharingWebEndpoints.listShareRequests,
      { spaceId },
      { query: { status } }) as ApiResponse<{ data: SpaceShareRequest[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  /** Approve / reject an incoming request. */
  resolveRequest: async (requestId: string, approve: boolean): Promise<void> => {
    const res = await call(spaceSharingWebEndpoints.resolveRequest, { requestId }, { body: { approve } }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },

  // ── Guest side ────────────────────────────────────────────────────────────
  /** Spaces shared WITH the current org (PENDING invites + ACTIVE shares). */
  listSharedSpaces: async (): Promise<SharedSpace[]> => {
    const res = await call(spaceSharingWebEndpoints.listSharedSpaces) as ApiResponse<{ data: SharedSpace[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  /** Accept or decline a PENDING invite. */
  respondToShare: async (shareId: string, accept: boolean): Promise<void> => {
    const res = await call(spaceSharingWebEndpoints.respondToShare, { shareId }, { body: { accept } }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },
  /** Raise a "request more" (extra task / worker) against a shared space. */
  createGuestRequest: async (
    shareId: string,
    input: { type: SpaceShareRequestType; title: string; note?: string },
  ): Promise<SpaceShareRequest> => {
    const res = await call(
      spaceSharingWebEndpoints.createGuestRequest,
      { shareId },
      { body: input }) as ApiResponse<{ data: SpaceShareRequest }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  /** The guest org's own requests on a shared space. */
  listGuestRequests: async (spaceId: string, status?: string): Promise<SpaceShareRequest[]> => {
    const res = await call(
      spaceSharingWebEndpoints.listGuestRequests,
      { spaceId },
      { query: { status } }) as ApiResponse<{ data: SpaceShareRequest[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
};
