/**
 * Route tracking: the real road, kept through dead zones, never lost to a
 * busy server, and never left off by a stale registration.
 *
 * Written after a real drive on 2026-09-30 recorded one point in 3½ minutes:
 * the trip started with GPS silently off, and the points it did hold were
 * refused with 429 on arrival and then DISCARDED.
 */
const store = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { store.delete(k); }),
    multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => store.delete(k)); }),
  },
}));
const secure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => secure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { secure.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { secure.delete(k); }),
}));
let taskFn: ((a: any) => Promise<void>) | null = null;
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((_n: string, fn: any) => { taskFn = fn; }),
  isTaskRegisteredAsync: jest.fn(async () => true),
}));
const location = {
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  Accuracy: { High: 4 },
  ActivityType: { AutomotiveNavigation: 2 },
};
jest.mock('expo-location', () => location);
jest.mock('../location-consent', () => ({ requestBackgroundLocationConsent: jest.fn(async () => false) }));
jest.mock('../route-arrival', () => ({
  checkArrival: jest.fn(async () => undefined),
  setRouteDestination: jest.fn(async () => undefined),
  clearRouteDestination: jest.fn(async () => undefined),
}));
class ApiError extends Error {
  constructor(message: string, public statusCode: number) { super(message); }
}
const trackingApi = { updateLocationBatch: jest.fn(), updateLocation: jest.fn() };
jest.mock('../../lib/api', () => ({ trackingApi, ApiError }));
jest.mock('../../lib/api/client', () => ({ getAccessToken: jest.fn(async () => 'token') }));

import { cleanRoutePoints, ROUTE_MAX_ACCURACY_M } from '@hbcfield/shared/client';
import { startRouteTracking, flushPendingRoute, forgetRouteData } from '../background-route-tracking';

const at = (s: number) => new Date(Date.UTC(2026, 8, 30, 6, 0, s)).toISOString();
const loc = (lat: number, lng: number, s: number, accuracy = 5) => ({
  coords: { latitude: lat, longitude: lng, accuracy }, timestamp: Date.parse(at(s)),
});
const pending = () => JSON.parse(store.get('route_pending_bursts') ?? '[]') as { points: unknown[] }[];
const heldCount = () => pending().reduce((n, b) => n + b.points.length, 0);

beforeEach(() => {
  // The points are timed on 2026-09-30; pin "now" beside them so the age and
  // future checks do not start failing the week after this was written.
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(at(1300)));
  store.clear();
  secure.clear();
  jest.clearAllMocks();
  secure.set('active_route_task_id', 'task-1');
});

describe('which points are kept (shared with the server)', () => {
  const now = Date.parse(at(600));
  it('drops a fix worse than ±50 m', () => {
    const kept = cleanRoutePoints([
      { lat: 47.98, lng: 13.82, accuracy: ROUTE_MAX_ACCURACY_M, timestamp: at(0) },
      { lat: 47.9801, lng: 13.8201, accuracy: 80, timestamp: at(10) },
    ], { now });
    expect(kept).toHaveLength(1);
  });
  it('drops an impossible jump, even against the previous burst', () => {
    const kept = cleanRoutePoints([{ lat: 48.5, lng: 13.82, timestamp: at(20) }], {
      now, previous: { lat: 47.98, lng: 13.82, timestamp: at(10) },
    });
    expect(kept).toHaveLength(0);
  });
  it('keeps a real drive in time order, and drops the same fix sent twice', () => {
    const kept = cleanRoutePoints([
      { lat: 47.9802, lng: 13.82, timestamp: at(20) },
      { lat: 47.98, lng: 13.82, timestamp: at(0) },
      { lat: 47.9801, lng: 13.82, timestamp: at(10) },
      { lat: 47.9801, lng: 13.82, timestamp: at(10) },
    ], { now });
    expect(kept.map((p) => p.timestamp)).toEqual([at(0), at(10), at(20)]);
  });
  it('drops a time in the future and 0,0', () => {
    expect(cleanRoutePoints([{ lat: 47.98, lng: 13.82, timestamp: at(900) }], { now })).toHaveLength(0);
    expect(cleanRoutePoints([{ lat: 0, lng: 0, timestamp: at(0) }], { now })).toHaveLength(0);
  });
});

describe('starting a trip', () => {
  it('starts GPS when the task is registered but updates are NOT running', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    await startRouteTracking('task-1');
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    const opts = (location.startLocationUpdatesAsync.mock.calls[0] as any)[1];
    expect(opts).toMatchObject({ distanceInterval: 20, timeInterval: 15000, deferredUpdatesInterval: 30000 });
  });
  it('does not start twice when updates are really running', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
    await startRouteTracking('task-1');
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});

describe('delivering points', () => {
  const burst = async (n: number) =>
    taskFn!({ data: { locations: Array.from({ length: n }, (_, i) => loc(47.98 + i * 0.0002, 13.82, i * 5)) } });

  it('sends a burst as ONE batch request', async () => {
    trackingApi.updateLocationBatch.mockResolvedValue({});
    await burst(5);
    expect(trackingApi.updateLocationBatch).toHaveBeenCalledTimes(1);
    expect(trackingApi.updateLocation).not.toHaveBeenCalled();
    expect(heldCount()).toBe(0);
  });

  it('KEEPS the points when the server says too many requests (429), and sends them later', async () => {
    trackingApi.updateLocationBatch.mockRejectedValueOnce(new ApiError('slow down', 429));
    await burst(7);
    expect(heldCount()).toBe(7);
    trackingApi.updateLocationBatch.mockResolvedValue({});
    await flushPendingRoute();
    expect(heldCount()).toBe(0);
  });

  it('keeps them offline too', async () => {
    trackingApi.updateLocationBatch.mockRejectedValueOnce(new ApiError('offline', 0));
    await burst(3);
    expect(heldCount()).toBe(3);
  });

  it('drops a burst the server refuses for good (400) instead of carrying it forever', async () => {
    trackingApi.updateLocationBatch.mockRejectedValueOnce(new ApiError('bad', 400));
    await burst(3);
    expect(heldCount()).toBe(0);
  });

  it('splits a long dead zone into batches of at most 500', async () => {
    const points = Array.from({ length: 1200 }, (_, i) => ({ lat: 47.98 + i * 0.0002, lng: 13.82, timestamp: at(i) }));
    store.set('route_pending_bursts', JSON.stringify([{ taskId: 'task-1', points }]));
    trackingApi.updateLocationBatch.mockResolvedValue({});
    await flushPendingRoute();
    const sizes = trackingApi.updateLocationBatch.mock.calls.map((c: any) => c[0].points.length);
    expect(sizes).toEqual([500, 500, 200]);
  });

  it('never keeps a GPS jump', async () => {
    trackingApi.updateLocationBatch.mockResolvedValue({});
    await taskFn!({ data: { locations: [loc(47.98, 13.82, 0), loc(49.5, 13.82, 5), loc(47.9802, 13.82, 10)] } });
    const sent = (trackingApi.updateLocationBatch.mock.calls[0] as any)[0].points;
    expect(sent).toHaveLength(2);
  });
});

describe('signing out', () => {
  it('wipes every held point from the phone', async () => {
    store.set('route_pending_bursts', JSON.stringify([{ taskId: 'task-1', points: [{ lat: 1, lng: 1 }] }]));
    store.set('route_last_point', JSON.stringify({ lat: 1, lng: 1 }));
    await forgetRouteData();
    expect(store.has('route_pending_bursts')).toBe(false);
    expect(store.has('route_last_point')).toBe(false);
  });
});
