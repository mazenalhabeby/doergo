/**
 * WHOSE session is this? — read from the access token itself.
 *
 * The phone holds one pair of tokens at a time, and work kept on the device
 * (queued check-ins, route points, the background sync's member) belongs to
 * whoever those tokens were issued to. Asking the TOKEN rather than a stored
 * user record means the two can never disagree: the server put the member's id
 * in `sub` and signed it.
 *
 * Decoding only — the signature is the server's business. A token we cannot
 * read is owned by nobody, and nobody's work is ever sent with it.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url → UTF-8 text, without `atob` or `Buffer` (neither is promised on every runtime). */
function base64UrlDecode(input: string): string | null {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    if (ch === '=') break;
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  try {
    // Percent-encode each byte and let decodeURIComponent assemble UTF-8.
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

/** The `exp` claim of a JWT (seconds since 1970), or null when it is not one. */
export function jwtExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const json = base64UrlDecode(parts[1]!);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

/** The `sub` claim of a JWT, or null when it is not one. */
export function jwtSubject(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const json = base64UrlDecode(parts[1]!);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
