import { expoCrypto } from '../lib/optional-native';

/*
  Random bytes from the native generator when the build has it. A build without
  expo-crypto cannot run offline at all (see offlineCapableBuild), but the id
  helper is still imported at start-up there, so it must not throw — the
  fallback only ever serves ids that stay online.
*/
function randomBytes(n: number): Uint8Array {
  const native = expoCrypto();
  if (native) return native.getRandomBytes(n);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/**
 * A UUIDv7: time-ordered, so ids made offline sort in the order they were made,
 * and random enough that two phones never collide.
 *
 * Every record the phone creates gets one, and the server stores it as the real
 * id — no temporary ids to remap after sync, and a retried create is naturally
 * the same create.
 */
export function uuidv7(now: number = Date.now(), random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(16);
  const ms = BigInt(now);
  // 48-bit big-endian millisecond timestamp.
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
