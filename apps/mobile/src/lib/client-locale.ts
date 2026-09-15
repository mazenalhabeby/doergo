import { clientLocalePayload, type SupportedLocale } from '@hbcfield/shared/client';

/**
 * "Language for emails" on the phone's client form and record.
 *
 * The same field as the web's client form, on the same rules
 * (`crm/client-locale.ts` in shared): the five languages the server accepts,
 * each named in itself, and "" for "same as the organization", which is SENT
 * as null — resolved when an email goes out, never guessed into the record.
 *
 * Kept as plain functions so the rules are testable without a screen: what a
 * new client's body carries (online AND in the offline outbox — the queued
 * payload is this same object, replayed later), and who may change it on a
 * record.
 */
export { CLIENT_LOCALE_OPTIONS, clientLocaleFormValue, clientLocaleName, clientLocalePayload } from '@hbcfield/shared/client';

export interface NewClientForm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
}

// A type alias, not an interface: the outbox takes `Record<string, unknown>`,
// and only an alias is assignable to an index signature.
export type NewClientInput = {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  spaceId?: string;
  /** null = same as the organization. Always present, so a queued create cannot lose it. */
  locale: SupportedLocale | null;
};

/**
 * The body a new client is created with — ONE object for both roads.
 *
 * ⚠️ The phone sends it directly when there is a signal and queues it in the
 * outbox when there is not. Building it once and handing the same object to
 * both is what keeps the language from being on the online save and missing
 * from the one replayed tomorrow morning.
 */
export function newClientInput(form: NewClientForm, spaceId: string | null, locale: string): NewClientInput | null {
  const name = form.name.trim();
  if (!name) return null;
  return {
    name,
    contactName: form.contactName.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    spaceId: spaceId ?? undefined,
    locale: clientLocalePayload(locale),
  };
}

/**
 * May this person change the language on this record?
 *
 * It is client INFO, like the phone number, so it rides on `editInfo` — the
 * ability the single-client read returns for THIS record. Absent means no: a
 * control that exists only to be refused by the save is worse than a row that
 * simply reads.
 */
export function canEditClientLocale(customer: { crmCaps?: { editInfo?: boolean } | null } | null | undefined): boolean {
  return customer?.crmCaps?.editInfo === true;
}
