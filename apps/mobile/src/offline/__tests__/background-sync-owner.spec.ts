/**
 * ⚠️ The background sync sends a member's queue only with THAT member's token.
 *
 * Member A signs out with unsent work, member B signs in on the same phone; the
 * next background run used to open A's queue and send A's clock-in with B's
 * token — filed on B, as B.
 */
const secure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => secure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void secure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void secure.delete(k)),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu',
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => false) }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })), scheduleNotificationAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn() } }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k }, i18nReady: Promise.resolve() }));
let owner: string | null = null;
jest.mock('../../lib/api/client', () => ({ sessionOwnerId: jest.fn(async () => owner) }));
jest.mock('../../services/background-route-tracking', () => ({ flushPendingRoute: jest.fn(async () => undefined) }));
jest.mock('../native', () => ({ loadBackgroundTask: () => null, loadNetInfo: () => null }));
const flush = jest.fn(async () => undefined);
const createOfflineRuntime = jest.fn(async () => ({ engine: { flush, operations: () => [], stop: jest.fn() }, files: {} }));
jest.mock('../runtime', () => ({ connectivity: { setUnmetered: jest.fn() }, createOfflineRuntime: (...a: unknown[]) => (createOfflineRuntime as jest.Mock)(...a) }));
jest.mock('../../services/auto-clock/context', () => ({ autoClockWake: jest.fn(async () => undefined) }));
jest.mock('../telemetry', () => ({ reportTelemetry: jest.fn(async () => undefined) }));
jest.mock('../attendance/refused-shift-notify', () => ({ notifyRefusedShifts: jest.fn(async () => undefined) }));

import { mayRunFor, runOnce } from '../background-sync';

beforeEach(() => {
  secure.clear();
  jest.clearAllMocks();
  secure.set('offline_background_member', JSON.stringify({ userId: 'mike', organizationId: 'org' }));
});

describe('whose queue may be sent', () => {
  it('the rule', () => {
    expect(mayRunFor({ userId: 'mike', organizationId: 'o' }, 'mike')).toBe(true);
    expect(mayRunFor({ userId: 'mike', organizationId: 'o' }, 'karim')).toBe(false);
    expect(mayRunFor({ userId: 'mike', organizationId: 'o' }, null)).toBe(false);
    expect(mayRunFor(null, 'mike')).toBe(false);
  });

  it('another member\'s token: the queue is not even opened', async () => {
    owner = 'karim';
    expect(await runOnce()).toBe(true);
    expect(createOfflineRuntime).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('signed out: nothing is sent as anybody', async () => {
    owner = null;
    await runOnce();
    expect(createOfflineRuntime).not.toHaveBeenCalled();
  });

  it('the member\'s own token: their queue is sent', async () => {
    owner = 'mike';
    await runOnce();
    expect(createOfflineRuntime).toHaveBeenCalledWith({ userId: 'mike', organizationId: 'org' });
    expect(flush).toHaveBeenCalled();
  });
});
