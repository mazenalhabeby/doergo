import type { AutoClockPlan } from '@hbcfield/shared/client';
import type { PlainStorage } from '../../lib/secure-buffer';
import { autoClockKey, sealedStore } from '../../lib/sealed-stores';
import type { PlaceState } from './rules';

/**
 * What the automatic clock keeps on the phone, per member — read by the app and
 * by the geofence task with the app closed, so it lives in a sealed store
 * (lib/secure-buffer.ts) and not in the offline database: a headless task opening
 * a second connection to that database is what once killed the offline engine.
 *
 * ⚠️ It holds when somebody walked in and out of their workplace — sealed with
 * the member's key, and gone with it at the end of the session.
 */
export interface AutoClockState {
  /** The member's organization — the background task builds the outbox with it. */
  organizationId?: string;
  /** The server answers the plan route at all (false: an older server, 404). */
  available?: boolean;
  /** The last plan the server sent — the phone arms and decides offline from it. */
  plan: AutoClockPlan | null;
  /** The member switched it off with no signal; the server is told on the next refresh. */
  withdrawPending?: boolean;
  /** By workspace id. */
  places: Record<string, PlaceState>;
}

export const EMPTY_AUTO_CLOCK: AutoClockState = { plan: null, places: {} };

export interface AutoClockStore {
  load(owner: string): Promise<AutoClockState>;
  save(owner: string, state: AutoClockState): Promise<void>;
  forget(owner: string): Promise<void>;
}

export function createAutoClockStore(storageFor: (owner: string) => PlainStorage): AutoClockStore {
  return {
    async load(owner) {
      const raw = await storageFor(owner).getItem(autoClockKey(owner)).catch(() => null);
      if (!raw) return { ...EMPTY_AUTO_CLOCK, places: {} };
      try {
        const v = JSON.parse(raw) as Partial<AutoClockState>;
        return { ...EMPTY_AUTO_CLOCK, ...v, places: v.places ?? {} };
      } catch {
        return { ...EMPTY_AUTO_CLOCK, places: {} };
      }
    },
    async save(owner, state) {
      await storageFor(owner).setItem(autoClockKey(owner), JSON.stringify(state));
    },
    async forget(owner) {
      await storageFor(owner).removeItem(autoClockKey(owner)).catch(() => undefined);
    },
  };
}

/** The phone's one automatic-clock store. */
export const autoClockStore = createAutoClockStore((owner) => sealedStore('auto-clock', owner));
