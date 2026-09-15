import { normalizeLocale, type SupportedLocale } from '../notifications/locale';

/**
 * Which language an email ADDRESS reads, when the address belongs to somebody
 * with an account.
 *
 * Most mail goes to a member and is resolved by id (notification-service's
 * RecipientLocales). Some goes to an address: an invitation, a client's signing
 * link, a scheduled report's recipient list. An address is not a person — but
 * when it IS a login (a portal client, an orphan account being invited, a
 * manager on a report's list), that person has already told us their language,
 * and it beats every guess the sender's side could make.
 *
 * The rule every address-based sender follows, in order:
 *   1. the recipient's own account, when the address is one;
 *   2. what the sending side knows (the inviting member, the schedule's author);
 *   3. English.
 *
 * A CLIENT is the exception to step 2 — the sending member's language says
 * nothing about a client's — and follows `clientEmailLocales` instead, which
 * asks the client record and the organization in its place.
 *
 * ONE query for the whole list — a report to twelve addresses is one lookup,
 * not twelve. Only addresses that are an account WITH a language come back, so
 * the caller's fallback applies to everything else. `User.email` is stored
 * lower-case, so the lookup is too.
 */
export interface UserLocaleReader {
  user: {
    // `unknown` args, as the other shared Prisma helpers take them: the
    // generated client's generic signature is not assignable to a narrower one.
    findMany: (args: unknown) => Promise<Array<{ email: string; locale: string | null }>>;
  };
}

export async function localesByAddress(
  prisma: UserLocaleReader,
  addresses: Array<string | null | undefined>,
): Promise<Map<string, SupportedLocale>> {
  const wanted = [...new Set(addresses.map((a) => a?.trim().toLowerCase()).filter((a): a is string => !!a))];
  const found = new Map<string, SupportedLocale>();
  if (wanted.length === 0) return found;
  const rows = await prisma.user.findMany({
    where: { email: { in: wanted } },
    select: { email: true, locale: true },
  });
  for (const row of rows) {
    const locale = normalizeLocale(row.locale);
    if (locale) found.set(row.email.toLowerCase(), locale);
  }
  return found;
}

/** Group recipients by the language each reads, so each language is rendered once. */
export function groupByLocale<T>(items: T[], localeOf: (item: T) => SupportedLocale): Map<SupportedLocale, T[]> {
  const groups = new Map<SupportedLocale, T[]>();
  for (const item of items) {
    const locale = localeOf(item);
    const group = groups.get(locale);
    if (group) group.push(item);
    else groups.set(locale, [item]);
  }
  return groups;
}
