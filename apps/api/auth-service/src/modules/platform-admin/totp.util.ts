import { createHmac, randomBytes } from 'crypto';

/**
 * Minimal, dependency-free TOTP (RFC 6238) for platform-staff 2FA. Base32 secret,
 * SHA-1, 6 digits, 30s step, ±1 window. Node crypto only — no new dependency.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

/**
 * The time step a 6-digit code matches (±1 step), or null.
 *
 * Returned rather than a yes/no so the caller can remember the step it
 * accepted and refuse that step — and every earlier one — next time: a code
 * is otherwise valid for ~90 seconds, plenty for one read over a shoulder or
 * out of a log to be replayed.
 */
export function matchTotpStep(secretB32: string, token: string, nowMs: number = Date.now()): number | null {
  const t = (token ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return null;
  const secret = base32Decode(secretB32);
  const step = Math.floor(nowMs / 1000 / 30);
  for (let w = -1; w <= 1; w++) if (hotp(secret, step + w) === t) return step + w;
  return null;
}

export function otpauthUri(email: string, secretB32: string, issuer = 'HBCField'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
