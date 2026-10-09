import { isEmail } from 'class-validator';

/**
 * The most addresses one scheduled delivery may carry.
 *
 * A schedule is a standing instruction to send the organization's figures out
 * of the product, on a timer, to whatever addresses it holds. Unbounded, it is
 * a mailing list nobody reviews; twenty is more than any real distribution of
 * a report and few enough that a person reading the schedule sees all of them.
 */
export const MAX_REPORT_RECIPIENTS = 20;

export type RecipientListResult =
  | { ok: true; recipients: string[] }
  | { ok: false; code: 'RECIPIENTS_REQUIRED' | 'RECIPIENT_INVALID' | 'RECIPIENTS_TOO_MANY'; invalid?: string };

/**
 * Typed addresses → the list a delivery will use: trimmed, lower-cased,
 * de-duplicated, each a real address, at most `max`.
 *
 * Refuses rather than drops: an address silently removed is a report somebody
 * believes they are receiving and is not. Not an array, or an entry that is not
 * a string, is refused the same way — the list arrives from a request body.
 */
export function normalizeRecipients(raw: unknown, max = MAX_REPORT_RECIPIENTS): RecipientListResult {
  if (!Array.isArray(raw)) return { ok: false, code: 'RECIPIENTS_REQUIRED' };
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') return { ok: false, code: 'RECIPIENT_INVALID', invalid: String(entry) };
    const address = entry.trim().toLowerCase();
    if (!address) continue;
    if (address.length > 254 || !isEmail(address)) return { ok: false, code: 'RECIPIENT_INVALID', invalid: entry };
    if (!out.includes(address)) out.push(address);
  }
  if (out.length === 0) return { ok: false, code: 'RECIPIENTS_REQUIRED' };
  if (out.length > max) return { ok: false, code: 'RECIPIENTS_TOO_MANY' };
  return { ok: true, recipients: out };
}
