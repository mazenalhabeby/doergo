import { MATCH_HASH_HEX, matchKeyMaterial, type PhoneContact } from '@hbcfield/shared/client';
import { expoContacts, expoCrypto } from './optional-native';

/**
 * The phone's address book — read for the contacts import, and nothing else.
 *
 * ⚠️ `expo-contacts` AND `expo-crypto` ARE NEVER IMPORTED AT MODULE SCOPE. Both
 * call `requireNativeModule` on evaluation, which THROWS on a binary built
 * before they were added — and this file reaches those binaries over the air.
 * They are loaded through `./optional-native`, which asks first and requires
 * second; `native-imports.spec.ts` fails on a direct import.
 *
 * ⚠️ READ ONLY. The library's config plugin also asks Android for
 * WRITE_CONTACTS; `app.config.ts` blocks it. This app never writes to anybody's
 * address book and must not hold the permission to.
 *
 * The permission hook lives in `permissions/contacts-permission.ts`, beside the
 * other permission bindings.
 */

/** Can THIS build read contacts at all? Asked before the option is offered. */
export function canReadContacts(): boolean {
  return !!expoContacts();
}

/**
 * iOS 18 lets somebody share only SOME contacts. The list is then what they
 * shared, and this opens the system sheet to share more. Elsewhere it is a
 * no-op that resolves false.
 */
export async function shareMoreContacts(): Promise<boolean> {
  try {
    const added = await expoContacts()?.presentAccessPickerAsync();
    return !!added?.length;
  } catch {
    return false;
  }
}

/**
 * Every contact, reduced to the four kinds of fact the import uses.
 *
 * ⚠️ FIELDS ARE NAMED, never "all": photos, notes, birthdays and addresses
 * stay unread. Asking for all fields is how a 2,000-entry book takes seconds
 * and loads every contact's photo into memory to show none of them.
 */
export async function readPhoneContacts(): Promise<PhoneContact[]> {
  const c = expoContacts();
  if (!c) return [];
  const { Fields, ContactTypes } = c;
  const res = await c.getContactsAsync({
    fields: [Fields.Name, Fields.FirstName, Fields.LastName, Fields.Company, Fields.JobTitle, Fields.Emails, Fields.PhoneNumbers, Fields.ContactType],
  });
  const out: PhoneContact[] = [];
  for (const x of res.data) {
    if (!x.id) continue;
    out.push({
      id: x.id,
      name: x.name ?? '',
      firstName: x.firstName ?? null,
      lastName: x.lastName ?? null,
      company: x.company ?? null,
      jobTitle: x.jobTitle ?? null,
      savedAsCompany: x.contactType === ContactTypes.Company,
      emails: (x.emails ?? []).map((e) => e.email ?? '').filter(Boolean),
      phones: (x.phoneNumbers ?? []).map((p) => p.number ?? p.digits ?? '').filter(Boolean),
    });
  }
  return out;
}

/**
 * The hashes of these keys, exactly as the server makes them (`hashKey` in the
 * auth-service import), so a contact can be checked against the organization's
 * clients without being sent.
 *
 * Done in parallel batches: a few thousand native digests one after another
 * would keep the "already a client" marks waiting for seconds, and all of them
 * at once would queue thousands of bridge calls.
 */
export async function hashMatchKeys(organizationId: string, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const Crypto = expoCrypto();
  // No digest on this build: no marks. The server still checks every import.
  if (!Crypto) return out;
  const BATCH = 200;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    const hashes = await Promise.all(
      slice.map((k) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, matchKeyMaterial(organizationId, k))),
    );
    slice.forEach((k, j) => out.set(k, hashes[j]!.slice(0, MATCH_HASH_HEX)));
  }
  return out;
}
