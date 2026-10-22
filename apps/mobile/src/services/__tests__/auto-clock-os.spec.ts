/**
 * The automatic clock's two edges with the OS: the ONE geofence task shared
 * with the shift ring, and the notifications the OS delivers on time with no
 * JavaScript running.
 */
const notifications = {
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  dismissNotificationAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
jest.mock('expo-notifications', () => notifications);
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}` }, i18nReady: Promise.resolve() }));
jest.mock('@/lib/session/stored-user', () => ({ loadStoredUser: jest.fn(async () => ({ timeFormat: '24h' })) }));

let armed: { regions: unknown[] } | null = null;
const location = {
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startGeofencingAsync: jest.fn(async (_t: string, regions: unknown[]) => { armed = { regions }; }),
  stopGeofencingAsync: jest.fn(async () => { armed = null; }),
  GeofencingEventType: { Enter: 1, Exit: 2 },
  Accuracy: { Balanced: 3 },
};
jest.mock('expo-location', () => location);
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => armed !== null),
  getTaskOptionsAsync: jest.fn(async () => armed),
}));
jest.mock('../kept-check-ins', () => ({ keptCheckIns: { flush: jest.fn(), keep: jest.fn() } }));
jest.mock('@/lib/api', () => ({ attendanceApi: { heartbeat: jest.fn() } }));
jest.mock('@/lib/api/client', () => ({ getAccessToken: jest.fn(async () => 't') }));
jest.mock('../auto-clock/context', () => ({ handleAutoRegionEvent: jest.fn(async () => undefined) }));

import { composeRegions, setAutoClockRegions, startGeofenceForSpace, stopGeofence } from '../background-geofence';
import { autoClockNotifier, notificationIdFor } from '../auto-clock/notifications';
import { MAX_OS_REGIONS, autoRegionId, type OsRegion } from '../auto-clock/rules';

const region = (identifier: string): OsRegion => ({ identifier, latitude: 47.98, longitude: 13.82, radius: 80, notifyOnEnter: true, notifyOnExit: true });

describe('one geofence task, two purposes', () => {
  beforeEach(() => {
    armed = null;
    jest.clearAllMocks();
  });

  it('a purpose replaces only its own regions, and the ring is never the one cut', () => {
    const auto = Array.from({ length: 25 }, (_, i) => region(autoRegionId(`s${i}`)));
    const next = composeRegions([region('ring:hall'), ...auto.slice(0, 3)], 'auto', auto);
    expect(next).toHaveLength(MAX_OS_REGIONS);
    expect(next[0]!.identifier).toBe('ring:hall');
    expect(composeRegions(next, 'ring', []).some((r) => r.identifier === 'ring:hall')).toBe(false);
    expect(composeRegions(next, 'ring', []).filter((r) => r.identifier.startsWith('auto:'))).toHaveLength(MAX_OS_REGIONS - 1);
  });

  it('clocking out removes the ring and leaves the automatic clock armed', async () => {
    await setAutoClockRegions([region(autoRegionId('hall'))]);
    await startGeofenceForSpace({ id: 'hall', lat: 47.98, lng: 13.82, geofenceRadius: 40 });
    expect((armed!.regions as OsRegion[]).map((r) => r.identifier)).toEqual(['ring:hall', 'auto:hall']);
    await stopGeofence();
    expect((armed!.regions as OsRegion[]).map((r) => r.identifier)).toEqual(['auto:hall']);
  });

  it('an unchanged set is not armed again — arming makes the OS report every region once more', async () => {
    await setAutoClockRegions([region(autoRegionId('hall'))]);
    await setAutoClockRegions([region(autoRegionId('hall'))]);
    expect(location.startGeofencingAsync).toHaveBeenCalledTimes(1);
  });

  it('disarming the automatic clock with no ring stops the task', async () => {
    await setAutoClockRegions([region(autoRegionId('hall'))]);
    await setAutoClockRegions([]);
    expect(armed).toBeNull();
  });
});

describe('the notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('are handed to the OS with a date, so they arrive with the app closed — and carry their recipient', async () => {
    const showAt = new Date(Date.now() + 3 * 60_000);
    await autoClockNotifier.clockedIn({ userId: 'u1', entryId: 'e1', place: 'Hall 3', at: new Date(), showAt });
    const call = (notifications.scheduleNotificationAsync.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(call.identifier).toBe(notificationIdFor('in', 'e1'));
    expect(call.trigger).toMatchObject({ type: 'date', date: showAt });
    expect(call.content.categoryIdentifier).toBe('auto_clock_in');
    expect(call.content.data).toMatchObject({ type: 'attendance.auto_clock', entryId: 'e1', recipientId: 'u1' });
  });

  it('a clock-out or an undo takes back exactly what the shift scheduled', async () => {
    await autoClockNotifier.cancel('e1');
    const ids = notifications.cancelScheduledNotificationAsync.mock.calls.map((c) => (c as unknown as string[])[0]);
    expect(ids).toEqual([notificationIdFor('in', 'e1'), notificationIdFor('rest', 'e1'), notificationIdFor('end', 'e1')]);
    expect(notifications.dismissNotificationAsync).toHaveBeenCalledTimes(3);
  });

  it('nothing is scheduled where the member turned notifications off', async () => {
    notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await autoClockNotifier.arrivedPrompt({ userId: 'u1', spaceId: 'hall', place: 'Hall 3' });
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
