/**
 * THE END OF A SESSION — one path, and everything it must clear.
 *
 * Six exits used to clean up six different subsets (see end-session.ts). These
 * tests pin both halves: what `endSession` clears for each reason, and that
 * every exit in the app reaches it rather than doing its own partial version.
 */
import * as fs from 'fs';
import * as path from 'path';

const calls: string[] = [];
const rec = (name: string, result?: unknown) => jest.fn(async (..._a: unknown[]) => { calls.push(name); return result; });

const mocks = {
  logout: rec('server:logout'),
  clearInflightRequests: jest.fn(() => { calls.push('inflight'); }),
  clearTokens: rec('tokens'),
  sessionOwnerId: rec('owner', 'token-owner'),
  setResponseCache: jest.fn((v: unknown) => { calls.push(`responseCache:${v}`); }),
  forget: rec('biometrics:forget'),
  forgetEverythingKept: jest.fn(() => { calls.push('kept-widgets'); }),
  purgePush: rec('push'),
  stopRoute: rec('route:stop'),
  forgetRoute: rec('route:forget'),
  stopHeartbeat: rec('heartbeat'),
  stopGeofence: rec('geofence'),
  forgetCheckIns: rec('check-ins'),
  forgetAutoClock: rec('auto-clock'),
  unregisterSync: rec('background-sync'),
  destroyDb: rec('db:destroy'),
  destroyFiles: jest.fn((_id: string) => { calls.push('files:destroy'); }),
  destroyMedia: jest.fn((_id: string) => { calls.push('media:destroy'); }),
  forgetLegacy: rec('legacy:forget'),
  legacyWaiting: jest.fn(async (_id: string) => false),
  forgetSecure: jest.fn(async (id: string) => { calls.push(`secure:forget:${id}`); return true; }),
  loadStoredUser: jest.fn(async () => ({ id: 'mike' })),
  clearStoredUser: rec('stored-user'),
};

jest.mock('@/lib/api/auth', () => ({ authApi: { logout: () => mocks.logout() } }));
jest.mock('@/lib/api/client', () => ({
  clearInflightRequests: () => mocks.clearInflightRequests(),
  clearTokens: () => mocks.clearTokens(),
  sessionOwnerId: () => mocks.sessionOwnerId(),
}));
jest.mock('@/lib/api/response-cache', () => ({ setResponseCache: (v: unknown) => mocks.setResponseCache(v) }));
jest.mock('@/lib/biometrics', () => ({ biometricCredential: { forget: () => mocks.forget() } }));
jest.mock('@/lib/remember/store', () => ({ forgetEverythingKept: () => mocks.forgetEverythingKept() }));
jest.mock('@/hooks/use-push-notifications', () => ({ purgePushTokenRegistration: () => mocks.purgePush() }));
jest.mock('@/services/background-route-tracking', () => ({
  stopRouteTracking: () => mocks.stopRoute(),
  forgetRouteData: () => mocks.forgetRoute(),
}));
jest.mock('@/services/background-heartbeat', () => ({ stopBackgroundHeartbeat: () => mocks.stopHeartbeat() }));
jest.mock('@/services/background-geofence', () => ({ stopAllGeofences: () => mocks.stopGeofence() }));
jest.mock('@/services/auto-clock/plan', () => ({ forgetAutoClock: (id: string) => mocks.forgetAutoClock(id) }));
jest.mock('@/services/kept-check-ins', () => ({ keptCheckIns: { forgetAll: () => mocks.forgetCheckIns() } }));
jest.mock('@/offline/background-sync', () => ({ unregisterBackgroundSync: () => mocks.unregisterSync() }));
jest.mock('@/offline/db/database', () => ({ destroyOfflineDatabase: (id: string) => mocks.destroyDb(id) }));
jest.mock('@/offline/files/device-file-disk', () => ({
  DeviceFileDisk: { forMember: (id: string) => ({ destroyAll: () => mocks.destroyFiles(id) }) },
}));
jest.mock('@/offline/files/media-cache', () => ({ MediaCache: { destroyForMember: (id: string) => mocks.destroyMedia(id) } }));
jest.mock('@/offline/attendance/legacy-worklog-queue', () => ({
  forgetLegacyWorklog: () => mocks.forgetLegacy(),
  legacyWorklogWaiting: (id: string) => mocks.legacyWaiting(id),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { removeItem: jest.fn(async (k: string) => { calls.push(`async-storage:remove:${k}`); }) } }));
jest.mock('@/lib/secure-buffer', () => ({ forgetSecure: (id: string) => mocks.forgetSecure(id) }));
jest.mock('../stored-user', () => ({
  loadStoredUser: () => mocks.loadStoredUser(),
  clearStoredUser: () => mocks.clearStoredUser(),
}));

import { endSession, shouldDestroyLocalData } from '../end-session';
import { onSessionEnd, registerUnsentProbe } from '../session-registry';
import { readSource } from '@/test-utils/read-source';

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  mocks.legacyWaiting.mockResolvedValue(false);
  mocks.loadStoredUser.mockResolvedValue({ id: 'mike' });
});

const LOCAL_SESSION = ['inflight', 'tokens', 'responseCache:null', 'kept-widgets', 'route:forget', 'check-ins', 'auto-clock', 'background-sync', 'stored-user'];
const LOCAL_DATA = [
  'legacy:forget', 'db:destroy', 'files:destroy', 'media:destroy', 'async-storage:remove:pending_avatar_v1_mike',
  'async-storage:remove:route_plan_v1_mike', 'secure:forget:mike',
];

describe('a sign-out clears everything the session filled', () => {
  it('stops every tracker, tells the server, and clears tokens, buffers, caches and the stored user', async () => {
    const cleaned: string[] = [];
    const off = onSessionEnd('calendar-pages', () => void cleaned.push('calendar'));
    const offPortal = onSessionEnd('portal-query-client', () => void cleaned.push('portal'));
    const result = await endSession({ reason: 'signed-out', keepUnsent: false });
    off();
    offPortal();

    expect(calls).toEqual(expect.arrayContaining(['route:stop', 'heartbeat', 'geofence', 'push', 'server:logout', ...LOCAL_SESSION, ...LOCAL_DATA]));
    expect(cleaned.sort()).toEqual(['calendar', 'portal']);
    expect(mocks.destroyDb).toHaveBeenCalledWith('mike');
    expect(result).toEqual({ userId: 'mike', localDataDestroyed: true, keptUnsent: false });
    // A plain sign-out keeps the Face ID binding.
    expect(calls).not.toContain('biometrics:forget');
  });

  it('stops the trackers before anything else, and tells the server before the tokens go', async () => {
    await endSession({ reason: 'signed-out', keepUnsent: false });
    const at = (n: string) => calls.indexOf(n);
    expect(Math.max(at('route:stop'), at('heartbeat'), at('geofence'))).toBeLessThan(at('push'));
    expect(at('push')).toBeLessThan(at('tokens'));
    expect(at('server:logout')).toBeLessThan(at('tokens'));
    expect(at('tokens')).toBeLessThan(at('db:destroy'));
  });
});

describe('unsent work', () => {
  it('a sign-out that keeps unsent work keeps the database when the engine says something waits', async () => {
    const off = registerUnsentProbe('mike', () => true);
    const result = await endSession({ reason: 'signed-out', keepUnsent: true });
    off();
    expect(calls).not.toEqual(expect.arrayContaining(['db:destroy']));
    expect(calls).toEqual(expect.arrayContaining(LOCAL_SESSION));
    expect(result.keptUnsent).toBe(true);
  });

  it('…and deletes it when nothing waits', async () => {
    const off = registerUnsentProbe('mike', () => false);
    const result = await endSession({ reason: 'signed-out', keepUnsent: true });
    off();
    expect(calls).toEqual(expect.arrayContaining(LOCAL_DATA));
    expect(result.localDataDestroyed).toBe(true);
  });

  it('the old work-log queue counts as unsent work', async () => {
    mocks.legacyWaiting.mockResolvedValue(true);
    const off = registerUnsentProbe('mike', () => false);
    await endSession({ reason: 'signed-out', keepUnsent: true });
    off();
    expect(calls).not.toContain('db:destroy');
    expect(calls).not.toContain('legacy:forget');
  });

  it('when nobody could look (no engine running), nothing is deleted on a guess', () => {
    expect(shouldDestroyLocalData({ reason: 'signed-out', keepUnsent: true, unsent: null })).toBe(false);
    expect(shouldDestroyLocalData({ reason: 'expired', keepUnsent: true, unsent: false })).toBe(true);
    expect(shouldDestroyLocalData({ reason: 'signed-out', keepUnsent: false, unsent: true })).toBe(true);
  });
});

describe('the buffer key (lib/secure-buffer.ts) — a crypto-shred, only with the data', () => {
  it('is forgotten when the local copy is destroyed — after everything else of the member\'s is gone', async () => {
    await endSession({ reason: 'signed-out', keepUnsent: false });
    expect(mocks.forgetSecure).toHaveBeenCalledWith('mike');
    expect(calls.indexOf('secure:forget:mike')).toBeGreaterThan(calls.indexOf('legacy:forget'));
    expect(calls.indexOf('secure:forget:mike')).toBeGreaterThan(calls.indexOf('route:forget'));
  });

  it('⚠️ is KEPT when unsent work is kept — or the kept notes could never be read back', async () => {
    mocks.legacyWaiting.mockResolvedValue(true);
    const off = registerUnsentProbe('mike', () => true);
    const result = await endSession({ reason: 'signed-out', keepUnsent: true });
    off();
    expect(result.keptUnsent).toBe(true);
    expect(mocks.forgetSecure).not.toHaveBeenCalled();
  });

  it('is forgotten on account deletion even with unsent work', async () => {
    const off = registerUnsentProbe('mike', () => true);
    await endSession({ reason: 'account-deleted', keepUnsent: true });
    off();
    expect(mocks.forgetSecure).toHaveBeenCalledWith('mike');
  });

  it('a key store that fails to delete does not stop the sign-out', async () => {
    mocks.forgetSecure.mockRejectedValueOnce(new Error('keychain'));
    const result = await endSession({ reason: 'signed-out', keepUnsent: false });
    expect(result.localDataDestroyed).toBe(true);
    expect(calls).toContain('stored-user');
  });
});

describe('the reasons differ only where they must', () => {
  it('a refused session does not call the server again (it would loop back into the auth failure)', async () => {
    await endSession({ reason: 'expired', keepUnsent: true });
    expect(calls).not.toContain('push');
    expect(calls).not.toContain('server:logout');
    expect(calls).toEqual(expect.arrayContaining(['route:stop', 'heartbeat', 'geofence', ...LOCAL_SESSION]));
  });

  it('⚠️ account deletion ALWAYS erases the local copy — unsent or not — and forgets the device key', async () => {
    const off = registerUnsentProbe('mike', () => true);
    const result = await endSession({ reason: 'account-deleted', keepUnsent: true });
    off();
    expect(calls).toEqual(expect.arrayContaining([...LOCAL_SESSION, ...LOCAL_DATA, 'biometrics:forget']));
    expect(result.localDataDestroyed).toBe(true);
    // The account is gone: no logout call to a server that no longer knows it.
    expect(calls).not.toContain('server:logout');
    // The key is forgotten while its token can still authenticate the removal.
    expect(calls.indexOf('biometrics:forget')).toBeLessThan(calls.indexOf('tokens'));
  });

  it('falls back to the token\'s owner when no user was stored', async () => {
    mocks.loadStoredUser.mockResolvedValue(null as never);
    await endSession({ reason: 'signed-out', keepUnsent: false });
    expect(mocks.destroyDb).toHaveBeenCalledWith('token-owner');
  });

  it('two exits at once run it once', async () => {
    await Promise.all([endSession({ reason: 'expired' }), endSession({ reason: 'signed-out' })]);
    expect(calls.filter((c) => c === 'tokens')).toHaveLength(1);
  });
});

/*
  Every exit reaches endSession — read from the source, because the exits are
  React screens and these specs are not.
*/
const MOBILE = path.resolve(__dirname, '../../../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readSource(path.join(MOBILE, p), 'utf8'));
function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const sources = () => [...walk(path.join(MOBILE, 'src')), ...walk(path.join(MOBILE, 'app'))].map((f) => ({ rel: path.relative(MOBILE, f), src: strip(readSource(f, 'utf8')) }));

describe('every exit is the one exit', () => {
  it('the auth context\'s sign-out, refused session, failed restore and web-only refusal all call endSession', () => {
    const ctx = read('src/contexts/auth-context.tsx');
    expect(ctx).toMatch(/const handleAuthFailure = useCallback\(async \(\) => \{\s*[^}]*await endSession\(\{ reason: 'expired'/);
    expect(ctx).toMatch(/const logout = useCallback\(async[\s\S]*?await endSession\(\{ reason: opts\?\.reason \?\? 'signed-out'/);
    expect(ctx).toMatch(/getAccessPlatforms\(response\.user\) === 'web'\) \{\s*await endSession\(\{ reason: 'refused-platform'/);
    expect(ctx).toMatch(/Error loading stored auth[\s\S]*?await endSession\(/);
  });

  it('Profile, account deletion, the onboarding pass and the customer portal sign out through logout()', () => {
    expect(read('src/features/profile/profile-screen.tsx')).toMatch(/await logout\(\{ keepUnsent: false \}\)/);
    expect(read('src/features/settings/account-page.tsx')).toMatch(/await logout\(\{ reason: 'account-deleted' \}\)/);
    expect(read('src/features/onboarding/pass-frame.tsx')).toMatch(/logout\(\)/);
    expect(read('app/(customer)/(tabs)/profile.tsx')).toMatch(/const signOut = \(\) => logout\(\)/);
  });

  it('nothing else does its own partial teardown', () => {
    // Each of these is part of ending a session; outside the session layer it is a second, partial exit.
    const SESSION_ONLY: Record<string, string[]> = {
      'clearTokens(': ['src/lib/session/end-session.ts', 'src/lib/api/client.ts', 'src/lib/api/auth.ts'],
      'destroyOfflineDatabase(': ['src/lib/session/end-session.ts', 'src/offline/db/database.ts'],
      'unregisterBackgroundSync(': ['src/lib/session/end-session.ts', 'src/offline/background-sync.ts'],
      'forgetEverythingKept(': ['src/lib/session/end-session.ts', 'src/lib/remember/store.ts'],
      'forgetRouteData(': ['src/lib/session/end-session.ts', 'src/services/background-route-tracking.ts'],
      'purgePushTokenRegistration(': ['src/lib/session/end-session.ts', 'src/hooks/use-push-notifications.ts'],
      'destroyForMember(': ['src/lib/session/end-session.ts', 'src/offline/files/media-cache.ts'],
    };
    const offenders: string[] = [];
    for (const { rel, src } of sources()) {
      for (const [call, allowed] of Object.entries(SESSION_ONLY)) {
        if (src.includes(call) && !allowed.includes(rel)) offenders.push(`${rel} → ${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the dead TokenMonitor (a seventh exit, rendered nowhere) is gone', () => {
    expect(fs.existsSync(path.join(MOBILE, 'src/components/token-monitor.tsx'))).toBe(false);
    expect(read('src/components/index.ts')).not.toMatch(/TokenMonitor/);
  });
});
