import fs from 'fs';
import path from 'path';
import {
  STARTER_DOCUMENT_TYPES,
  starterDocumentType,
  documentTypeKey,
  typeConsequences,
} from '@hbcfield/shared/client';

/**
 * Document types are the configuration everything else in the personnel file
 * rests on: who may upload what, what expires, and who drops out of the
 * dispatch pool when it does. A wrong default here is not a cosmetic problem —
 * it is a certificate that silently gates nothing, or a payslip a member can
 * delete.
 */

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const load = (l: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8'));

describe('the starter document types', () => {
  it('offers both directions, or the screen teaches half the model', () => {
    // "You issue it" vs "they provide it" is THE distinction this feature is
    // built on. A starter list of only one kind would hide it.
    const directions = new Set(STARTER_DOCUMENT_TYPES.map((t) => t.direction));
    expect(directions).toEqual(new Set(['ISSUED', 'SUPPLIED']));
  });

  it('gives every starter a unique key', () => {
    // The key is unique per organization in the database; a duplicate here
    // would fail on save and read as a bug rather than as a duplicate.
    const keys = STARTER_DOCUMENT_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every starter a key that survives the normaliser', () => {
    // The server re-normalises whatever it is sent. A starter whose key changed
    // in transit would not match the one the picker filtered on, so a type
    // already created would keep being offered.
    for (const t of STARTER_DOCUMENT_TYPES) {
      expect(documentTypeKey(t.key)).toBe(t.key);
    }
  });

  it('tracks expiry on every credential it ships', () => {
    /*
      A credential without an expiry never lapses, so it can never appear on the
      compliance board as anything but valid — which makes the board a list of
      green ticks. Legitimate for a qualification that does not expire, but not
      as a DEFAULT anybody would have chosen deliberately.
    */
    for (const t of STARTER_DOCUMENT_TYPES.filter((x) => x.isCredential)) {
      expect({ key: t.key, hasExpiry: t.hasExpiry }).toEqual({ key: t.key, hasExpiry: true });
    }
  });

  it('never asks a member to sign something they supplied themselves', () => {
    // A signature mode on a SUPPLIED type would ask somebody to counter-sign
    // their own driving licence.
    for (const t of STARTER_DOCUMENT_TYPES.filter((x) => x.direction === 'SUPPLIED')) {
      expect({ key: t.key, mode: t.signatureMode }).toEqual({ key: t.key, mode: 'NONE' });
    }
  });

  it('makes every credential something the member supplies', () => {
    // The company does not hold anybody's driving licence. A credential the
    // company issues to itself is a category error.
    for (const t of STARTER_DOCUMENT_TYPES.filter((x) => x.isCredential)) {
      expect({ key: t.key, direction: t.direction }).toEqual({ key: t.key, direction: 'SUPPLIED' });
    }
  });

  it('keeps a retention period on everything, in whole years', () => {
    for (const t of STARTER_DOCUMENT_TYPES) {
      expect(t.retentionMonths).not.toBeNull();
      expect(t.retentionMonths! % 12).toBe(0);
      // Fifty years is the server's ceiling; a starter must not sit above it.
      expect(t.retentionMonths!).toBeLessThanOrEqual(600);
    }
  });

  it('keeps payroll longer than a first-aid card', () => {
    // Not arbitrary: the tax authority's window is years longer than a
    // certificate's, and a single global retention setting could not express it.
    expect(starterDocumentType('payslip')!.retentionMonths!).toBeGreaterThan(
      starterDocumentType('first_aid')!.retentionMonths!,
    );
  });

  it('offers a passport AND an ID card, which are not the same document', () => {
    /*
      Both are identity, both expire, and they are scanned completely
      differently — which is the reason they are separate starters rather than
      one vague "ID document". A passport keeps everything on the photo page; an
      ID card keeps the machine-readable zone on the back.
    */
    const passport = starterDocumentType('passport')!;
    const idCard = starterDocumentType('id_card')!;

    expect(passport.twoSided).toBe(false);
    expect(idCard.twoSided).toBe(true);
    // Both tracked for expiry: a lapsed passport is a right-to-work problem,
    // not a filing detail.
    expect([passport.hasExpiry, idCard.hasExpiry]).toEqual([true, true]);
    expect([passport.isCredential, idCard.isCredential]).toEqual([true, true]);
  });

  it('asks for the back of exactly the card-shaped documents', () => {
    /*
      The bug this pins: the scanner derived "two sides" from `isCredential`,
      which is wrong in BOTH directions — a gas certificate is a credential with
      a blank back, and a passport is one whose data is all on the front. It
      asked people to photograph the cover of a passport.
    */
    const twoSided = STARTER_DOCUMENT_TYPES.filter((t) => t.twoSided).map((t) => t.key);
    expect(twoSided.sort()).toEqual(['driving_licence', 'id_card']);

    // And nothing the company ISSUES is ever scanned at all.
    for (const t of STARTER_DOCUMENT_TYPES.filter((x) => x.direction === 'ISSUED')) {
      expect({ key: t.key, twoSided: t.twoSided }).toEqual({ key: t.key, twoSided: false });
    }
  });

  it('finds nothing for an unknown key', () => {
    expect(starterDocumentType('not_a_type')).toBeNull();
  });
});

describe('documentTypeKey', () => {
  it('turns a label into a machine key', () => {
    expect(documentTypeKey('Driving licence')).toBe('driving_licence');
  });

  it('collapses punctuation and accents to underscores rather than dropping them silently', () => {
    expect(documentTypeKey('Gas / Safe (2026)')).toBe('gas_safe_2026');
  });

  it('trims leading and trailing separators', () => {
    expect(documentTypeKey('  — Payslip — ')).toBe('payslip');
  });

  it('is idempotent, so re-typing a key does not change it', () => {
    const once = documentTypeKey('First-aid certificate');
    expect(documentTypeKey(once)).toBe(once);
  });

  it('caps at the length the column and the server both use', () => {
    // 60, matching `normaliseKey` in auth-service — which now calls this very
    // function, so the two cannot drift.
    expect(documentTypeKey('x'.repeat(200))).toHaveLength(60);
  });

  it('returns empty for a label with nothing usable in it', () => {
    // The editor disables Save on this, rather than sending a key of "".
    expect(documentTypeKey('!!!')).toBe('');
  });
});

describe('typeConsequences', () => {
  const base = {
    direction: 'ISSUED' as const,
    cadence: 'ONE_OFF' as const,
    isCredential: false,
    hasExpiry: false,
    signatureMode: 'NONE' as const,
  };

  it('always says who provides it — the first thing anybody needs to know', () => {
    expect(typeConsequences(base)).toContain('youIssue');
    expect(typeConsequences({ ...base, direction: 'SUPPLIED' })).toContain('memberUploads');
  });

  it('mentions a period only when there is one', () => {
    expect(typeConsequences(base)).not.toContain('perPeriod');
    expect(typeConsequences({ ...base, cadence: 'MONTHLY' })).toContain('perPeriod');
  });

  it('distinguishes signing from acknowledging from paper', () => {
    expect(typeConsequences({ ...base, signatureMode: 'IN_APP' })).toContain('mustSign');
    expect(typeConsequences({ ...base, signatureMode: 'ACKNOWLEDGE' })).toContain('mustAcknowledge');
    expect(typeConsequences({ ...base, signatureMode: 'WET_INK' })).toContain('onPaper');
  });

  it('says a credential is tracked, and separately that it gates work', () => {
    /*
      The distinction the compliance board rests on. A lapsed certificate that
      gates nothing is a reminder; one that gates a task type has already
      removed somebody from the pool.
    */
    const tracked = typeConsequences({ ...base, isCredential: true, hasExpiry: true });
    expect(tracked).toContain('expiresTracked');
    expect(tracked).not.toContain('gatesWork');

    const gating = typeConsequences({
      ...base, isCredential: true, hasExpiry: true, requiredForWorkflowIds: ['w1'],
    });
    expect(gating).toContain('gatesWork');
  });

  it('does not claim a non-credential gates work, even if ids were left behind', () => {
    // Turning the credential switch off clears the list in the editor, but a
    // row saved before that must not still read as gating.
    expect(
      typeConsequences({ ...base, isCredential: false, requiredForWorkflowIds: ['w1'] }),
    ).not.toContain('gatesWork');
  });
});

describe('the document-types screen is translated', () => {
  it.each(LOCALES)('names every starter in %s', (locale) => {
    const types = load(locale).documents.types;
    for (const t of STARTER_DOCUMENT_TYPES) {
      expect(typeof types.starters[t.key]?.label).toBe('string');
      expect(typeof types.starters[t.key]?.description).toBe('string');
    }
  });

  it.each(LOCALES)('explains every consequence the screen can print in %s', (locale) => {
    // The row renders these by key. A missing one prints the raw key path into
    // the middle of a sentence.
    const copy = load(locale).documents.types.consequences;
    for (const key of [
      'youIssue', 'memberUploads', 'perPeriod', 'mustSign', 'mustAcknowledge',
      'onPaper', 'expiresTracked', 'credentialNoExpiry', 'gatesWork',
    ]) {
      expect(typeof copy[key]).toBe('string');
    }
  });

  it.each(LOCALES)('translates every direction and cadence choice in %s', (locale) => {
    const c = load(locale).documents.types;
    for (const d of ['issued', 'supplied']) {
      expect(typeof c.direction[d]).toBe('string');
      expect(typeof c.directionHint[d]).toBe('string');
    }
    for (const k of ['one_off', 'monthly', 'annual']) {
      expect(typeof c.cadence[k]).toBe('string');
      expect(typeof c.cadenceHint[k]).toBe('string');
    }
  });
});
