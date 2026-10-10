/**
 * As soon as a member is known, every plaintext value an older version left
 * for them — in every store, including ones rarely opened — is sealed in place.
 */
const disk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => disk.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { disk.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { disk.delete(k); }),
    multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => disk.delete(k)); }),
    getAllKeys: jest.fn(async () => [...disk.keys()]),
  },
}));
const keychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(async (k: string) => keychain.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { keychain.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { keychain.delete(k); }),
}));

import * as SecureStore from 'expo-secure-store';
import { sealLeftovers, sealedStore } from '../sealed-stores';
import { ENVELOPE, forgetSecure, readSecure } from '../secure-buffer';

const LEFT_BY_OLD_VERSION: Record<string, string> = {
  'route_pending_bursts:mike': '[{"taskId":"t","points":[{"lat":47.98,"lng":13.82}]}]',
  'route_pending_bursts:mike:index': '[{"id":"a","n":1}]',
  'route_pending_bursts:mike:a': '{"taskId":"t","points":[{"lat":47.98,"lng":13.82}]}',
  'route_last_point:mike': '{"lat":47.98,"lng":13.82}',
  'attendance_kept_check_ins_v1:mike': '[{"lat":47.98,"lng":13.82,"recordedAt":"2026-10-10T06:00:00.000Z"}]',
  '@hbcfield/kept/shift/mike': '{"value":{"status":"on"},"at":1}',
  'worklog_pending_mike:entry-1': '[{"id":"1","body":"Pump replaced at Gmunden","at":"2026-10-10T06:00:00.000Z"}]',
  'route_plan_v1_mike': '{"day":"2026-10-10","savedAt":1,"route":{"order":["s1"]}}',
};

// A forget also drops the per-process "already swept" memo, so each test starts from an un-migrated phone.
afterEach(() => forgetSecure('mike'));

beforeEach(() => {
  disk.clear();
  for (const [k, v] of Object.entries(LEFT_BY_OLD_VERSION)) disk.set(k, v);
  disk.set('route_pending_bursts:karim:index', '[]');
  disk.set('@hbcfield/kept/shift/karim', '{"value":1,"at":1}');
  disk.set('theme_mode', 'dark');
});

it('seals every store of the member in place, and only theirs', async () => {
  await sealLeftovers('mike');
  for (const [k, plain] of Object.entries(LEFT_BY_OLD_VERSION)) {
    expect(disk.get(k)!.startsWith(ENVELOPE)).toBe(true);
    expect(disk.get(k)).not.toContain('47.98');
    expect(await readSecure(k, 'mike')).toBe(plain);
  }
  expect(disk.get('route_pending_bursts:karim:index')).toBe('[]');
  expect(disk.get('@hbcfield/kept/shift/karim')).toBe('{"value":1,"at":1}');
  expect(disk.get('theme_mode')).toBe('dark');
  // The key is in the keychain, readable after first unlock, never off the device.
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringMatching(/^hbc_sb_key_mike$/), expect.any(String), { keychainAccessible: 6 });
});

it('the stores read the sealed values back', async () => {
  await sealLeftovers('mike');
  expect(disk.get('worklog_pending_mike:entry-1')!.startsWith(ENVELOPE)).toBe(true);
  expect(await sealedStore('worklog', 'mike').getItem('worklog_pending_mike:entry-1')).toBe(LEFT_BY_OLD_VERSION['worklog_pending_mike:entry-1']);
});

it('after the crypto-shred nothing of it opens', async () => {
  await sealLeftovers('mike');
  expect(disk.get('route_plan_v1_mike')!.startsWith(ENVELOPE)).toBe(true);
  await forgetSecure('mike');
  expect(keychain.has('hbc_sb_key_mike')).toBe(false);
  for (const k of Object.keys(LEFT_BY_OLD_VERSION)) expect(await readSecure(k, 'mike')).toBeNull();
});
