import type { RotaCell, RotaWeek } from '@hbcfield/shared/client';
import { call, E } from './client';

export type { RotaCell, RotaWeek };
export type RotaShift = RotaWeek['shifts'][number];

/** A workspace's week as the clock-in resolves it, and changing one day of it. */
export const rotaApi = {
  week: (params: { spaceId?: string; from?: string }): Promise<RotaWeek> =>
    call(E.rota.week, params),

  setDay: (body: { spaceId: string; userId: string; date: string; shiftId: string | null; repeat: 'once' | 'weekly' }): Promise<{ ok: true }> =>
    call(E.rota.setDay, undefined, { body }),
};
