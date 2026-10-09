import fs from 'fs';
import path from 'path';
import {
  buildContactImport,
  classifyContact,
  impliedCompanies,
  pickModel,
  prepareContacts,
  type ClassifiedContact,
  type PhoneContact,
} from '@hbcfield/shared/client';

/*
  Clients from the phone's address book.

  Two kinds of failure, both silent:
    · a native import at module scope crashes the clients screen for every
      phone on an older binary — the OTA reaches them, the module does not;
    · a wrong verdict fills a company's CRM with somebody's family, or hides a
      real client under "looks private".
*/

const MOBILE = path.join(__dirname, '../../..');
const MODULE = 'expo-contacts';

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the contacts module is never loaded at module scope', () => {
  const files = ['src', 'app'].flatMap((d) => sourceFiles(path.join(MOBILE, d))).filter((f) => !f.includes('__tests__'));

  it('finds the app source', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('only the optional-native loader names the package', () => {
    const named = files
      .filter((f) => {
        const code = stripComments(fs.readFileSync(f, 'utf8'));
        return code.includes(`'${MODULE}'`) || code.includes(`"${MODULE}"`);
      })
      .map((f) => path.relative(MOBILE, f));
    expect(named).toEqual(['src/lib/optional-native.ts']);
  });

  it('and there only behind the optional native check', () => {
    const code = stripComments(fs.readFileSync(path.join(MOBILE, 'src/lib/optional-native.ts'), 'utf8'));
    expect(code).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+['"]expo-contacts['"]/m);
    expect(code).toMatch(/optional\('ExpoContacts', \(\) => require\('expo-contacts'\)/);
  });

  it('says "cannot" rather than throwing when the module is absent', () => {
    // Jest has no native modules: this IS the absent case.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { canReadContacts, readPhoneContacts } = require('../phone-contacts');
    expect(canReadContacts()).toBe(false);
    return expect(readPhoneContacts()).resolves.toEqual([]);
  });
});

const contact = (over: Partial<PhoneContact> & { id: string; name: string }): PhoneContact => ({
  emails: [], phones: [], ...over,
});

describe('sorting an address book', () => {
  it('a GmbH is a business, saved as a company or not', () => {
    const c = classifyContact(contact({ id: '1', name: 'Danner Haustechnik GmbH', phones: ['+43 7612 88010'] }));
    expect(c).toMatchObject({ kind: 'COMPANY', signal: 'business', reason: 'LEGAL_FORM' });
  });

  it('a work email makes a person a business contact, and names their company', () => {
    const c = classifyContact(contact({ id: '1', name: 'Julia Brandl', firstName: 'Julia', lastName: 'Brandl', emails: ['j.brandl@brandl-architektur.at'] }));
    expect(c).toMatchObject({ kind: 'PERSON', signal: 'business', reason: 'WORK_EMAIL' });
    expect(c.groupKey).toBe('d:brandl-architektur.at');
  });

  it('family is private, in any of the five languages', () => {
    for (const name of ['Mama', 'Oma Gerti', 'Nonna', 'Papá']) {
      expect(classifyContact(contact({ id: name, name, phones: ['+43 664 100 2233'] })).reason).toBe('FAMILY');
    }
  });

  it('a GmbH called "Mama Pizza GmbH" is a company, not the family', () => {
    expect(classifyContact(contact({ id: '1', name: 'Mama Pizza GmbH', phones: ['07612 123456'] })).signal).toBe('business');
  });

  it('only a free-mail address is a private person', () => {
    const c = classifyContact(contact({ id: '1', name: 'Sabine Dorfer', firstName: 'Sabine', emails: ['sabine.dorfer@gmail.com'] }));
    expect(c).toMatchObject({ signal: 'private', reason: 'PRIVATE_EMAIL' });
  });

  it('a phone number alone is "other": not suggested, not called private', () => {
    expect(classifyContact(contact({ id: '1', name: 'Klaus', firstName: 'Klaus', phones: ['0664 1234567'] })).signal).toBe('other');
  });

  it('carries every key, normalised the way the server stores them', () => {
    const c = classifyContact(contact({ id: '1', name: 'X', emails: ['A@B.at'], phones: ['+43 664 812 3390', '0664 8123390'] }));
    expect(c.keys.sort()).toEqual(['648123390', 'a@b.at']);
  });
});

describe('the list', () => {
  const book = prepareContacts([
    contact({ id: 'p1', name: 'Thomas Berger', firstName: 'Thomas', jobTitle: 'Site manager', emails: ['t.berger@bauer-elektro.at'] }),
    contact({ id: 'p2', name: 'Anna Leitner', firstName: 'Anna', emails: ['a.leitner@bauer-elektro.at'] }),
    contact({ id: 'g', name: 'Paul Gruber', firstName: 'Paul', company: 'Gruber Bau', phones: ['0650 2210045'] }),
    contact({ id: 'm', name: 'Mama', phones: ['+43 664 100 2233'] }),
  ]);
  const isClient = (c: ClassifiedContact) => c.keys.includes('650221004'.padStart(9, '0').slice(-9)) || c.id === 'g';

  it('two people at one domain imply their company, which leads them', () => {
    expect(impliedCompanies(book.filter((c) => !c.id.startsWith('company:')))).toHaveLength(1);
    const m = pickModel(book, { filter: 'suggested', query: '', isClient });
    const contacts = m.rows.filter((r) => r.type === 'contact') as Extract<(typeof m.rows)[number], { type: 'contact' }>[];
    const firm = contacts.find((r) => r.contact.kind === 'COMPANY')!;
    expect(firm.members?.sort()).toEqual(['p1', 'p2']);
    expect(contacts.filter((r) => r.nested).map((r) => r.contact.id).sort()).toEqual(['p1', 'p2']);
  });

  it('Suggested hides private and clients behind one line; a search never hides', () => {
    const m = pickModel(book, { filter: 'suggested', query: '', isClient });
    expect(m.rows.some((r) => r.type === 'contact' && r.contact.id === 'm')).toBe(false);
    expect(m.rows.find((r) => r.type === 'hidden')).toMatchObject({ privateCount: 1, clientCount: 1 });
    const s = pickModel(book, { filter: 'suggested', query: 'mama', isClient });
    expect(s.rows.some((r) => r.type === 'contact' && r.contact.id === 'm')).toBe(true);
  });

  it('the tab counts describe the book, not the search', () => {
    const a = pickModel(book, { filter: 'all', query: '', isClient });
    const b = pickModel(book, { filter: 'all', query: 'zzz', isClient });
    expect(b.counts).toEqual(a.counts);
    expect(a.counts.clients).toBe(1);
  });
});

describe('what the import sends', () => {
  const book = prepareContacts([
    contact({ id: 'p1', name: 'Thomas Berger', firstName: 'Thomas', jobTitle: 'Site manager', emails: ['t.berger@bauer-elektro.at'], phones: ['0664 1'] }),
    contact({ id: 'p2', name: 'Anna Leitner', firstName: 'Anna', emails: ['a.leitner@bauer-elektro.at'] }),
  ]);
  let n = 0;
  const newRef = () => `0190a1b2-c3d4-7e5f-8a9b-${String(++n).padStart(12, '0')}`;

  it('people picked with their company travel as its contact people, company first', () => {
    const items = buildContactImport(book, { newRef, fields: { email: true, phone: true, role: true }, fillMissing: () => false });
    expect(items[0]!.kind).toBe('COMPANY');
    const company = items[0]!.ref;
    expect(items.filter((i) => i.kind === 'PERSON').every((i) => i.companyRef === company)).toBe(true);
  });

  it('a field switched off does not leave the phone', () => {
    const items = buildContactImport(book.filter((c) => c.id === 'p1'), { newRef, fields: { email: false, phone: true, role: false }, fillMissing: () => false });
    expect(items[0]).toMatchObject({ email: null, role: null });
  });

  it('never carries an id of an existing record — only refs it made', () => {
    const items = buildContactImport(book, { newRef, fields: { email: true, phone: true, role: true }, fillMissing: () => true });
    for (const i of items) {
      expect(Object.keys(i).sort()).toEqual(['companyRef', 'email', 'fillMissing', 'kind', 'name', 'phone', 'ref', 'role']);
      expect(i.ref).toMatch(/^0190a1b2-/);
    }
  });
});
