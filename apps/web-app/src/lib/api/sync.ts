import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { unwrap } from './onboarding';
import { syncEndpoints } from '@hbcfield/shared/client';

// ============================================================================
// PHONE SYNC — whose phone is still holding work done without signal
// ============================================================================

export const syncApi = {
  /**
   * Every phone in the organization that reported its offline queue in the last
   * 30 days — counts, ages and reason codes, never the work itself.
   * `canManageUsers`; the organization comes from the session.
   */
  memberHealth: async (): Promise<import('@hbcfield/shared/client').SyncMemberHealth[]> => {
    const response = await call(syncEndpoints.health) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    const rows = unwrap<import('@hbcfield/shared/client').SyncMemberHealth[]>(response.data);
    return Array.isArray(rows) ? rows : [];
  },
}
