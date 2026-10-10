/**
 * The attendance heartbeat: the newest fix, and "running" means updates are flowing.
 */
const location = {
  hasStartedLocationUpdatesAsync: jest.fn(async () => true),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  Accuracy: { Balanced: 3 },
  ActivityType: { Other: 1 },
};
jest.mock('expo-location', () => location);
const taskManager = { defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => true) };
jest.mock('expo-task-manager', () => taskManager);
jest.mock('../../lib/api', () => ({ attendanceApi: { heartbeat: jest.fn() } }));
jest.mock('../../lib/api/client', () => ({ getAccessToken: jest.fn(async () => 't') }));
jest.mock('../location-consent', () => ({ requestBackgroundLocationConsent: jest.fn(async () => true) }));
jest.mock('../kept-check-ins', () => ({ keptCheckIns: { flush: jest.fn(async () => true), keep: jest.fn() } }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => `t:${k}` } }));

import { newestFix, startBackgroundHeartbeat } from '../background-heartbeat';

const fix = (lat: number, timestamp: number) => ({ coords: { latitude: lat, longitude: 13 }, timestamp });

describe('which fix a deferred batch reports', () => {
  it('the newest, not the first of a quarter of an hour', () => {
    expect(newestFix([fix(1, 100), fix(2, 300), fix(3, 200)])?.coords.latitude).toBe(2);
    expect(newestFix([fix(1, 100), fix(2, 100)])?.coords.latitude).toBe(2);
    expect(newestFix([])).toBeNull();
  });
});

describe('starting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a registered task whose updates the OS stopped is started again', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    taskManager.isTaskRegisteredAsync.mockResolvedValueOnce(true);
    expect(await startBackgroundHeartbeat()).toBe(true);
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    const opts = (location.startLocationUpdatesAsync.mock.calls[0] as unknown[])[1] as { foregroundService: { notificationTitle: string; notificationBody: string } };
    // The lock-screen notification is in the member's language.
    expect(opts.foregroundService.notificationTitle).toBe('t:tracking.foreground.shiftTitle');
    expect(opts.foregroundService.notificationBody).toBe('t:tracking.foreground.shiftBody');
  });

  it('updates already flowing: nothing started twice', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
    expect(await startBackgroundHeartbeat()).toBe(true);
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});
