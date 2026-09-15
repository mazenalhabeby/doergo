import fs from 'fs';
import path from 'path';
import { SUPPORTED_LOCALES, parseClientLocale } from '@hbcfield/shared/client';
import { CLIENT_LOCALE_OPTIONS, canEditClientLocale, clientLocaleName, newClientInput } from '../client-locale';

/*
  "Language for emails" on the phone — the same field as the web's client form.

  What matters: the phone offers exactly what the server accepts; "same as the
  organization" leaves as null, never ""; a client added with no signal carries
  the language in the SAME body the outbox replays; and only somebody who may
  edit this client's info is offered the change.
*/
const blank = { name: 'Siemens AG', contactName: '', email: '', phone: '' };

describe('client language — the phone form', () => {
  it('offers exactly the languages the server accepts, each named in itself', () => {
    expect(CLIENT_LOCALE_OPTIONS.map((o) => o.value)).toEqual([...SUPPORTED_LOCALES]);
    for (const o of CLIENT_LOCALE_OPTIONS) expect(parseClientLocale(o.value)).toEqual({ ok: true, locale: o.value });
    expect(CLIENT_LOCALE_OPTIONS.find((o) => o.value === 'it')?.label).toBe('Italiano');
  });

  it('a new client carries the chosen language', () => {
    expect(newClientInput(blank, 'space-1', 'de')).toEqual({
      name: 'Siemens AG', contactName: undefined, email: undefined, phone: undefined, spaceId: 'space-1', locale: 'de',
    });
  });

  it("'same as the organization' is sent as null — present, not dropped, not an empty string", () => {
    const input = newClientInput(blank, null, '')!;
    expect('locale' in input).toBe(true);
    expect(input.locale).toBeNull();
    expect(input.spaceId).toBeUndefined();
  });

  it('survives the outbox: the queued payload is plain JSON and keeps the language', () => {
    const input = newClientInput({ ...blank, email: ' a.gruber@siemens.com ' }, 'space-1', 'fr')!;
    const replayed = JSON.parse(JSON.stringify({ lane: 'crm:new', body: input })).body;
    expect(replayed.locale).toBe('fr');
    expect(replayed.email).toBe('a.gruber@siemens.com');
  });

  it('refuses to build a client without a name', () => {
    expect(newClientInput({ ...blank, name: '   ' }, null, 'de')).toBeNull();
  });

  it('only somebody who may edit the client info is offered the change', () => {
    expect(canEditClientLocale({ crmCaps: { editInfo: true } })).toBe(true);
    expect(canEditClientLocale({ crmCaps: { editInfo: false } })).toBe(false);
    expect(canEditClientLocale({})).toBe(false);
    expect(canEditClientLocale(null)).toBe(false);
  });

  it('names the language on the record, or nothing when unset', () => {
    expect(clientLocaleName('de')).toBe('Deutsch');
    expect(clientLocaleName(null)).toBeNull();
    expect(clientLocaleName('pt')).toBeNull();
  });
});

describe('client language — wired into the screens', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');

  it('the add form sends ONE body both directly and through the outbox', () => {
    const src = read('app/(app)/customers.tsx');
    expect(src).toMatch(/const input = newClientInput\(form, formSpaceId, formLocale\)/);
    expect(src).toMatch(/clientCreate\.run\(\{ lane: 'crm:new', body: input \}, \(\) => customersApi\.create\(input\)\)/);
  });

  it('the record shows the language and gates changing it on editInfo', () => {
    const src = read('app/(app)/customer/[id].tsx');
    expect(src).toContain("t('customers.locale'");
    expect(src).toMatch(/disabled=\{!canEditClientLocale\(customer\)\}/);
    expect(src).toMatch(/customersApi\.update\(id, \{ locale \}\)/);
  });

  it('every language carries the strings', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const j = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      for (const k of ['locale', 'localeSame', 'localeHint', 'localeFailed']) {
        expect({ locale, k, ok: typeof j.customers?.[k] === 'string' && j.customers[k].length > 0 }).toEqual({ locale, k, ok: true });
      }
    }
  });
});
