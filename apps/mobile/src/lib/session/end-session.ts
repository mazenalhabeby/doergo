import { authApi } from '../api/auth';
import { clearInflightRequests, clearTokens, sessionOwnerId } from '../api/client';
import { setResponseCache } from '../api/response-cache';
import { biometricCredential } from '../biometrics';
import { forgetEverythingKept } from '../../features/home/remember/store';
import { purgePushTokenRegistration } from '../../hooks/usePushNotifications';
import { forgetRouteData, stopRouteTracking } from '../../services/background-route-tracking';
import { stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { stopAllGeofences } from '../../services/background-geofence';
import { forgetAutoClock } from '../../services/auto-clock/plan';
import { keptCheckIns } from '../../services/kept-check-ins';
import { unregisterBackgroundSync } from '../../offline/background-sync';
import { destroyOfflineDatabase } from '../../offline/db/database';
import { DeviceFileDisk } from '../../offline/files/device-file-disk';
import { MediaCache } from '../../offline/files/media-cache';
import { forgetLegacyWorklog, legacyWorklogWaiting } from '../../offline/attendance/legacy-worklog-queue';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_AVATAR_KEY } from '../../offline/profile/pending-avatar';
import { SAVED_ROUTE_KEY } from '../../offline/routes/saved-route';
import { forgetSecure } from '../secure-buffer';
import { clearStoredUser, loadStoredUser } from './stored-user';
import { hasUnsentWork, runSessionEndCleaners } from './session-registry';

/**
 * THE END OF A SESSION — the one way out, whoever asks for it.
 *
 * Six exits used to clean up six different subsets: Profile's sign-out removed
 * the offline database and background sync; the auth context's removed the GPS
 * and the widgets; a refused refresh removed ONE key and left the tokens'
 * owner's route points, check-ins, calendar pages and in-flight answers for
 * whoever signed in next; account deletion left the encrypted database on the
 * phone; the onboarding and customer-portal sign-outs did the auth context's
 * subset and nothing else. Every exit now calls this, and this does all of it.
 *
 * ⚠️ ORDER MATTERS, top to bottom:
 *  1. GPS, heartbeat and geofence stop first — a tracker left running keeps
 *     recording a person who is no longer signed in.
 *  2. The server is told while the session still authenticates (push token,
 *     then logout). Not on `expired`: the server already said the session is
 *     over, and asking again would only loop back into the auth failure.
 *  3. Whether unsent work exists is asked BEFORE anything is torn down.
 *  4. Tokens go, then everything the member's session filled on the device.
 *  5. Their offline database, files, media cache and buffer key go — unless the member
 *     still has unsent work and the caller asked to keep it (`keepUnsent`).
 *     ⚠️ ALWAYS on account deletion: there is no account left to send it to,
 *     and the data is theirs to have erased (GDPR art. 17).
 */
export type SessionEndReason =
  /** The member pressed Sign out (Profile, onboarding, customer portal). */
  | 'signed-out'
  /** The server refused the session (the refresh token was rejected). */
  | 'expired'
  /** The account itself is gone. */
  | 'account-deleted'
  /** Signed in to a profile this app may not be used with. */
  | 'refused-platform';

export interface EndSessionOptions {
  reason: SessionEndReason;
  /**
   * Keep the member's offline database when it still holds unsent work, so it
   * is sent when they sign back in. Default TRUE — deleting is the step that
   * cannot be undone. Profile passes false only after asking the member
   * (`offline.signOut.discard`). Ignored on account deletion.
   */
  keepUnsent?: boolean;
  /** Whose session it is, when the caller knows; otherwise the stored user or the token's owner. */
  userId?: string | null;
}

export interface EndSessionResult {
  userId: string | null;
  /** The member's offline database, files and queue were deleted. */
  localDataDestroyed: boolean;
  /** Unsent work was found and kept on the phone. */
  keptUnsent: boolean;
}

/** Should the member's local copy be deleted now? Pure — the decision, tested on its own. */
export function shouldDestroyLocalData(input: {
  reason: SessionEndReason;
  keepUnsent: boolean;
  /** true / false when it could be checked; null when nobody could look. */
  unsent: boolean | null;
}): boolean {
  if (input.reason === 'account-deleted') return true;
  if (!input.keepUnsent) return true;
  // Unknown counts as "maybe": a database nobody could look into is not deleted on a guess.
  return input.unsent === false;
}

const quietly = <T,>(p: Promise<T> | T): Promise<T | undefined> => Promise.resolve(p).catch(() => undefined);

let ending: Promise<EndSessionResult> | null = null;

export function endSession(options: EndSessionOptions): Promise<EndSessionResult> {
  // One at a time: a refused refresh and a tap on Sign out can arrive together,
  // and the second must wait for the first rather than run half of it again.
  if (ending) return ending;
  ending = run(options).finally(() => {
    ending = null;
  });
  return ending;
}

async function run({ reason, keepUnsent = true, userId: given }: EndSessionOptions): Promise<EndSessionResult> {
  const userId = given ?? (await quietly(loadStoredUser()))?.id ?? (await quietly(sessionOwnerId())) ?? null;
  const serverStillListens = reason === 'signed-out' || reason === 'refused-platform';

  // 1 — nothing keeps tracking a person who is no longer signed in.
  // (Stopping the route also sends what it held — still with this member's own token.)
  await Promise.all([quietly(stopRouteTracking()), quietly(stopBackgroundHeartbeat()), quietly(stopAllGeofences())]);

  // 2 — while the session still authenticates.
  if (serverStillListens) await quietly(purgePushTokenRegistration());

  // 3 — before anything below tears the engine down.
  const unsent = userId ? await unsentFor(userId) : false;
  const destroy = shouldDestroyLocalData({ reason, keepUnsent, unsent });

  if (reason === 'account-deleted') {
    // The one exit that forgets this phone's Face ID key: there is no account left to unlock.
    await quietly(biometricCredential.forget());
  }
  if (serverStillListens) {
    // Revokes the refresh token server-side (and carries the push token once more); clears the local pair.
    await quietly(authApi.logout());
  }

  // 4 — the session itself, then everything it filled.
  clearInflightRequests();
  await quietly(clearTokens());
  setResponseCache(null);
  forgetEverythingKept();
  await Promise.all([
    // Route points held for upload, the active route and its destination.
    quietly(forgetRouteData()),
    quietly(keptCheckIns.forgetAll()),
    // The automatic clock's plan, what it remembered of each visit, and its scheduled reminders.
    quietly(forgetAutoClock(userId)),
    quietly(unregisterBackgroundSync()),
    quietly(runSessionEndCleaners()),
  ]);

  // 5 — the member's own copy, unless unsent work is being kept for them.
  if (destroy) {
    await quietly(forgetLegacyWorklog());
    if (userId) {
      await quietly(destroyOfflineDatabase(userId));
      // A photo change waiting for signal points at a file that is about to go.
      await quietly(AsyncStorage.removeItem(PENDING_AVATAR_KEY(userId)));
      await quietly(AsyncStorage.removeItem(SAVED_ROUTE_KEY(userId)));
      /*
        ⚠️ THE MEMBER'S BUFFER KEY GOES LAST (lib/secure-buffer.ts): whatever
        sealed copy survived the sweeps above — or was copied off the phone in a
        backup — is noise from here on. Only here: when unsent work is KEPT, the
        key is kept with it, or the work could never be read back.
      */
      await quietly(forgetSecure(userId));
      try {
        DeviceFileDisk.forMember(userId).destroyAll();
        MediaCache.destroyForMember(userId);
      } catch {
        /* best effort — files with no key to read the database are no use to anybody */
      }
    }
  }

  await quietly(clearStoredUser());
  return { userId, localDataDestroyed: destroy, keptUnsent: !destroy && unsent !== false };
}

/** The engine's answer, or the old work-log queue's — either means work exists only here. */
/**
 * Does this member have work that exists only on this phone — the engine's
 * outbox OR the old work-log queue? The sign-out screen asks the SAME question
 * the session end decides by, so nothing is discarded without being asked.
 */
export async function hasUnsentLocalWork(userId: string): Promise<boolean> {
  return (await unsentFor(userId)) !== false;
}

async function unsentFor(userId: string): Promise<boolean | null> {
  const engine = hasUnsentWork(userId);
  if (engine === true) return true;
  if (await quietly(legacyWorklogWaiting(userId))) return true;
  return engine;
}
