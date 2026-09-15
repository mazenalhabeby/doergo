import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../notifications/locale';
import { organizationLocaleFromCountry } from '../crm/client-locale';
import { localesByAddress, type UserLocaleReader } from './email-locale';

/**
 * Which language an email to a CLIENT is written in.
 *
 * ONE rule for every sender that writes to a client — the signing link and its
 * re-send, the portal invitation and its re-send — so a client does not get the
 * invitation in German and the signing link in English because two services
 * each had their own idea. In order:
 *
 *   1. the ACCOUNT behind the address — a portal client who signs in chose a
 *      language in the app, and that is the reader telling us directly;
 *   2. the CLIENT RECORD — `Customer.locale`, what the office set. Found by the
 *      client the mail is about when the sender knows it, else by the address
 *      among this organization's clients;
 *   3. the ORGANIZATION — its country, where that states one language
 *      (`organizationLocaleFromCountry`);
 *   4. English.
 *
 * Deliberately NOT the sending member's language. The client is a different
 * company, and the person who pressed "send" writing German says nothing about
 * what the client's accounts department reads.
 *
 * Two lookups for a whole batch, however long: the accounts by address, then
 * — only if something is still unanswered — the organization with its matching
 * clients in the same call. Never one per recipient.
 *
 * Throws when the database does; a sender catches and writes English, because
 * a lookup that fails must cost the language, never the email.
 */
export interface ClientEmailRecipient {
  email: string;
  /** The client the mail is about, when the sender knows it. */
  customerId?: string | null;
}

export interface ClientLocaleReader extends UserLocaleReader {
  organization: {
    // `unknown` both ways: the generated client's result type follows the
    // `select`, which a structural signature cannot express — the shape read
    // back is `OrganizationClients`, fixed by the select below.
    findUnique: (args: unknown) => Promise<unknown>;
  };
}

interface OrganizationClients {
  country: string | null;
  customers: Array<{ id: string; email: string | null; locale: string | null }>;
}

/** A ceiling on matched client records, not a tuning knob — a client mail batch is never near it. */
const MAX_MATCHED_CLIENTS = 500;

export async function clientEmailLocales(
  prisma: ClientLocaleReader,
  organizationId: string,
  recipients: ClientEmailRecipient[],
): Promise<Map<string, SupportedLocale>> {
  const result = new Map<string, SupportedLocale>();
  const wanted = recipients
    .map((r) => ({ email: r.email?.trim().toLowerCase() ?? '', customerId: r.customerId ?? null }))
    .filter((r) => r.email);
  if (wanted.length === 0) return result;

  // 1. The account behind the address.
  const accounts = await localesByAddress(prisma, wanted.map((r) => r.email));
  const open = wanted.filter((r) => !accounts.has(r.email));
  for (const r of wanted) {
    const own = accounts.get(r.email);
    if (own) result.set(r.email, own);
  }
  if (open.length === 0) return result;

  // 2 + 3. The client records and the organization, in one call. Only clients
  // that HAVE a language come back — a record without one answers nothing.
  const ids = [...new Set(open.map((r) => r.customerId).filter((id): id is string => !!id))];
  const emails = [...new Set(open.map((r) => r.email))];
  const org = (await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      country: true,
      customers: {
        where: {
          locale: { not: null },
          OR: [
            ...(ids.length ? [{ id: { in: ids } }] : []),
            // Customer.email is stored as typed, so the match ignores case.
            ...emails.map((email) => ({ email: { equals: email, mode: 'insensitive' } })),
          ],
        },
        select: { id: true, email: true, locale: true },
        // The record touched most recently wins when one address is on two.
        orderBy: { updatedAt: 'desc' },
        take: MAX_MATCHED_CLIENTS,
      },
    },
  })) as OrganizationClients | null;

  const byId = new Map<string, SupportedLocale>();
  const byEmail = new Map<string, SupportedLocale>();
  for (const c of org?.customers ?? []) {
    const locale = normalizeLocale(c.locale);
    if (!locale) continue;
    byId.set(c.id, locale);
    const email = c.email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, locale);
  }
  const organization = organizationLocaleFromCountry(org?.country);

  for (const r of open) {
    if (result.has(r.email)) continue;
    result.set(
      r.email,
      (r.customerId ? byId.get(r.customerId) : undefined) ?? byEmail.get(r.email) ?? organization ?? DEFAULT_LOCALE,
    );
  }
  return result;
}

/** One client address. The same rule and the same two lookups, for a sender that writes to one person. */
export async function clientEmailLocale(
  prisma: ClientLocaleReader,
  organizationId: string,
  recipient: ClientEmailRecipient,
): Promise<SupportedLocale> {
  const map = await clientEmailLocales(prisma, organizationId, [recipient]);
  return map.get(recipient.email.trim().toLowerCase()) ?? DEFAULT_LOCALE;
}
