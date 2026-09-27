import { buildUrlWithQuery } from '@hbcfield/shared/client';
import { fetchWithAuth } from './client';

export type RotaCell =
  | { date: string; kind: 'shift'; shiftId: string; start: string; end: string; source: 'once' | 'weekly' }
  | { date: string; kind: 'schedule'; start: string; end: string }
  | { date: string; kind: 'leave' }
  | { date: string; kind: 'off' };

export interface RotaShift { id: string; name: string; color: string | null; startLocal: string; endLocal: string }

export interface RotaWeek {
  spaces: Array<{ id: string; name: string }>;
  space: { id: string; name: string; timezone: string; tracksAttendance: boolean } | null;
  days: string[];
  shifts: RotaShift[];
  people: Array<{ userId: string; firstName: string; lastName: string; avatarUrl: string | null; position: string | null; days: RotaCell[] }>;
  canEdit: boolean;
}

/** A workspace's week as the clock-in resolves it, and changing one day of it. */
export const rotaApi = {
  week: (params: { spaceId?: string; from?: string }): Promise<RotaWeek> =>
    fetchWithAuth<RotaWeek>(buildUrlWithQuery('/rota/week', params), { method: 'GET' }),

  setDay: (body: { spaceId: string; userId: string; date: string; shiftId: string | null; repeat: 'once' | 'weekly' }): Promise<{ ok: true }> =>
    fetchWithAuth('/rota/day', { method: 'POST', body: JSON.stringify(body) }),
};
