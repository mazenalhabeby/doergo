import { suggestExpiry } from '@hbcfield/shared/client';
import { readLines } from './ocr';

/**
 * A photographed document → the date it runs out, if it prints one.
 *
 * The third caller of the same reader, alongside the business card and the
 * fuel receipt, and the rules are `suggestExpiry` in shared — the very
 * function the SERVER uses on the same document. One set of rules, two places
 * they can run, and the member gets the same answer either way.
 *
 * ⚠️ ALWAYS A SUGGESTION, NEVER A FACT. What comes back is the latest date
 * printed on the page, which is right far more often than not — an EU driving
 * licence prints birth, issue and expiry, and the expiry is the last of them —
 * and wrong in a way the member sees and corrects before sending. A date from
 * a machine-readable zone is a different thing entirely: it carries a check
 * digit, it is checked on the SERVER, and it overrules this.
 *
 * Nothing leaves the phone. The page is read where it was taken, and what
 * travels is the upload the member was sending anyway.
 */
export async function readExpiryOnDevice(uri: string): Promise<string | null> {
  try {
    const lines = await readLines(uri);
    // The parser works on prose, not on a list — the same join the server's
    // OCR output arrives as, so both sides feed `suggestExpiry` the same shape.
    return suggestExpiry(lines.join('\n'))?.iso ?? null;
  } catch {
    // A reader that cannot read is not an error anybody can act on: the server
    // will try next, and the member can always type it.
    return null;
  }
}
