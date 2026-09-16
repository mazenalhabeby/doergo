import {
  CARD_FIELDS,
  cardCertainty,
  cardClientExtras,
  cardClientNames,
  cardContactInput,
  cardFieldsFor,
  cardValues,
  duplicateSearchTerm,
  fieldNeedsLook,
  guessCardKind,
  homelessFields,
  looksLikeSameClient,
} from '../card-review';
import type { CardValues } from '../card-review';

/**
 * What a scanned card MEANS, tested without a camera.
 *
 * These are the decisions the review screen is made of — is this a firm's card
 * or somebody's, which fields have a home, what is read and cannot be kept —
 * and every one of them used to live inside a 425-line screen where the only
 * way to try a case was to photograph a card.
 */

const card = (fields: Record<string, { value: string; confidence?: 'certain' | 'likely' }>, lines: string[] = []) =>
  ({ ...fields, lines } as never);

const values = (over: Partial<CardValues> = {}): CardValues => ({
  company: '', name: '', title: '', email: '', phone: '', website: '', address: '', vat: '', ...over,
});

describe('which kind of card this is', () => {
  it("reads a person's name as a person's card, and says why", () => {
    expect(guessCardKind(card({ name: { value: 'Anna Gruber' }, company: { value: 'Siemens AG' } })))
      .toEqual({ kind: 'PERSON', why: 'personNamed' });
  });

  it('names the job title in the reason when there was one', () => {
    expect(guessCardKind(card({ name: { value: 'Anna Gruber' }, title: { value: 'Prokuristin' } })))
      .toEqual({ kind: 'PERSON', why: 'personTitled' });
  });

  it('reads a firm with nobody on it as the firm\'s card', () => {
    expect(guessCardKind(card({ company: { value: 'BILLA AG' } })))
      .toEqual({ kind: 'COMPANY', why: 'companyNoPerson' });
  });

  it('admits when it cannot tell, rather than guessing quietly', () => {
    // COMPANY is the default because its form offers every field — nothing the
    // reader found is hidden while the member decides.
    expect(guessCardKind(card({ email: { value: 'a@b.com' } })))
      .toEqual({ kind: 'COMPANY', why: 'unsure' });
  });
});

describe('what the reader hands over', () => {
  it('carries every field, including the four the old screen threw away', () => {
    const parsed = card({
      company: { value: 'Siemens AG', confidence: 'likely' },
      name: { value: 'Anna Gruber', confidence: 'likely' },
      title: { value: 'Prokuristin', confidence: 'likely' },
      email: { value: 'a.gruber@siemens.com', confidence: 'certain' },
      phone: { value: '+43 1 234', confidence: 'certain' },
      website: { value: 'www.siemens.com', confidence: 'certain' },
      address: { value: 'Ringstraße 1, 1010 Wien', confidence: 'likely' },
      vat: { value: 'ATU12345678', confidence: 'certain' },
    });
    const v = cardValues(parsed);
    expect(CARD_FIELDS.every((k) => v[k] !== '')).toBe(true);
    // Only what the reader can PROVE is quiet; what it infers asks to be read.
    expect(cardCertainty(parsed)).toMatchObject({
      email: true, phone: true, website: true, vat: true,
      company: false, name: false, title: false, address: false,
    });
  });
});

describe('which rows are worth colouring', () => {
  it('colours a guess and an empty field, and nothing the reader proved', () => {
    expect(fieldNeedsLook('Anna Gruber', false)).toBe(true);   // inferred
    expect(fieldNeedsLook('', true)).toBe(true);               // nothing read
    expect(fieldNeedsLook('a@b.com', true)).toBe(false);       // proved by shape
  });

  it('goes quiet once the member has answered it', () => {
    // A field picked from the card's lines is marked certain, so the row it
    // sits in stops asking — in place, without moving to another heading and
    // taking the keyboard with it.
    expect(fieldNeedsLook('Siemens AG', true)).toBe(false);
  });
});

describe('a field is offered only if saving keeps it', () => {
  it.each([
    ['COMPANY', 'client'],
    ['PERSON', 'client'],
    ['PERSON', 'contact'],
    ['PERSON', 'newCompany'],
  ] as const)('accounts for every field on %s/%s', (kind, destination) => {
    const all = values(Object.fromEntries(CARD_FIELDS.map((k) => [k, 'x'])) as Partial<CardValues>);
    const shown = cardFieldsFor(kind, destination);
    const orphans = homelessFields(kind, destination, all);
    // Nothing may fall between the two: what is not offered is NAMED.
    expect([...shown, ...orphans].sort()).toEqual([...CARD_FIELDS].sort());
    expect(shown.filter((k) => orphans.includes(k))).toEqual([]);
  });

  it('gives the job title its one home — a contact person at a company', () => {
    expect(cardFieldsFor('PERSON', 'contact')).toContain('title');
    expect(cardFieldsFor('PERSON', 'client')).not.toContain('title');
    expect(cardFieldsFor('COMPANY', 'client')).not.toContain('title');
  });

  it('keeps website and VAT to the company card, where the server keeps them', () => {
    // They are COMPANY_ONLY_FIELDS in shared: sent on a person they are cleared,
    // so a box for them on a person's card would empty itself on save.
    expect(cardFieldsFor('COMPANY', 'client')).toEqual(expect.arrayContaining(['website', 'vat']));
    expect(cardFieldsFor('PERSON', 'client')).not.toContain('website');
    expect(cardClientExtras('PERSON', values({ website: 'x.com', vat: 'ATU1', address: 'Wien' })))
      .toEqual({ address: 'Wien' });
    expect(cardClientExtras('COMPANY', values({ website: 'x.com', vat: 'ATU1', address: 'Wien' })))
      .toEqual({ address: 'Wien', website: 'x.com', vatId: 'ATU1' });
  });

  /*
    ⚠️ CREATING the company is the one destination that loses nothing, and that
    is the argument for having it. The other two each throw something away: a
    person filed in their own right has no home for the firm, its website or its
    VAT number, and a contact at a company already in the book has no home for
    the firm's address. Both roads end with the member reading "also read, but
    with nowhere to go here".
  */
  it('keeps everything the card gave when the company is created from it', () => {
    const all = values(Object.fromEntries(CARD_FIELDS.map((k) => [k, 'x'])) as Partial<CardValues>);
    expect(homelessFields('PERSON', 'newCompany', all)).toEqual([]);
    // Including the department, which is the person's role at the new firm.
    expect(cardFieldsFor('PERSON', 'newCompany')).toEqual(expect.arrayContaining(['company', 'title']));
    // And it is the ONLY person road that keeps them.
    expect(homelessFields('PERSON', 'client', all).length).toBeGreaterThan(0);
    expect(homelessFields('PERSON', 'contact', all).length).toBeGreaterThan(0);
  });

  it('says nothing about a field the reader did not find', () => {
    // Absent is not homeless. Only what was actually read and cannot be kept.
    expect(homelessFields('PERSON', 'client', values({ name: 'Anna' }))).toEqual([]);
    expect(homelessFields('PERSON', 'client', values({ name: 'Anna', website: 'x.com' }))).toEqual(['website']);
  });
});

describe('which record the card becomes', () => {
  it('makes the firm the client and the person its contact', () => {
    expect(cardClientNames('COMPANY', values({ company: 'Siemens AG', name: 'Anna Gruber' })))
      .toEqual({ name: 'Siemens AG', contactName: 'Anna Gruber' });
  });

  it('falls back to the person when a company card carries no firm', () => {
    // Kept from the screen this replaces: the alternative is a card that saves
    // nothing at all.
    expect(cardClientNames('COMPANY', values({ name: 'Anna Gruber' })))
      .toEqual({ name: 'Anna Gruber', contactName: '' });
  });

  it('never puts a person under a contact name on their own card', () => {
    expect(cardClientNames('PERSON', values({ company: 'Siemens AG', name: 'Anna Gruber' })))
      .toEqual({ name: 'Anna Gruber', contactName: '' });
  });

  /*
    ⚠️ The split that matters when a company is CREATED from the card and the
    person hung off it: what belongs to the person must not land on the firm.
    `jasmin.walther@…` written onto the Stadtamt's record makes one person's
    inbox the organisation's address, and the next member to email that client
    writes to her by accident.
  */
  it('gives the person their own email and direct line, and the firm neither', () => {
    const read = values({
      company: 'Stadtamt Gmunden',
      name: 'Jasmin Walther',
      title: 'Liegenschaftsverwaltung',
      email: 'jasmin.walther@gmunden.ooe.gv.at',
      phone: '+43 676 88 794 243',
      address: 'Rathausplatz 1, 4810 Gmunden',
      website: 'gmunden.at',
    });
    expect(cardContactInput(read)).toEqual({
      person: {
        name: 'Jasmin Walther',
        email: 'jasmin.walther@gmunden.ooe.gv.at',
        phone: '+43 676 88 794 243',
      },
      // The department is the person's role at the firm — its one home.
      role: 'Liegenschaftsverwaltung',
    });
    // What the firm takes: its address and its website, and nothing personal.
    expect(cardClientExtras('COMPANY', read))
      .toEqual({ address: 'Rathausplatz 1, 4810 Gmunden', website: 'gmunden.at' });
  });

  it('omits what the card did not carry rather than sending empty strings', () => {
    expect(cardContactInput(values({ name: '  Anna Gruber  ' })))
      .toEqual({ person: { name: 'Anna Gruber', email: undefined, phone: undefined } });
  });
});

describe('is it already in the book', () => {
  it('matches the short form against the legal one, both ways round', () => {
    expect(looksLikeSameClient('BILLA', 'BILLA AG')).toBe(true);
    expect(looksLikeSameClient('Siemens AG', 'siemens')).toBe(true);
  });

  it('ignores accents and punctuation, which are how one firm becomes two', () => {
    expect(looksLikeSameClient('Müller & Co.', 'Muller & Co')).toBe(true);
  });

  it('stays quiet on short names, where everything contains everything', () => {
    expect(looksLikeSameClient('AB', 'ABC Handel')).toBe(false);
  });

  it('does not match two different firms', () => {
    expect(looksLikeSameClient('Siemens AG', 'Bosch GmbH')).toBe(false);
  });

  it('asks the server for the first word, which is what finds the short form', () => {
    // Searching "BILLA AG" cannot match a book holding "BILLA" — the server
    // matches a substring, and that duplicate is the one worth catching.
    expect(duplicateSearchTerm('BILLA AG')).toBe('BILLA');
    // Too short to narrow anything: send the whole thing instead.
    expect(duplicateSearchTerm('AB Handel')).toBe('AB Handel');
  });
});
