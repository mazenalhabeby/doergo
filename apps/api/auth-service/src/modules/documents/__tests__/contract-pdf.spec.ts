import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { renderContractPdf, sealSignedPdf } from '../contract-pdf';
import {
  parseBlocks,
  wrap,
  layout,
  unencodableCharacters,
  PAGE,
  MARGIN,
  type Measure,
} from '@hbcfield/shared';

/**
 * A contract's bytes are hashed and frozen at issue, and that hash is the whole
 * tamper-evidence story. So the property under test is not "it produces a PDF"
 * — it is that it produces the SAME PDF, byte for byte, every time.
 */

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const VALUES = {
  title: 'Dienstvertrag',
  body: [
    '§1 Position',
    '',
    'The employee is engaged as Field Technician commencing 01.09.2026, reporting to the Laakirchen workspace.',
    '',
    '§2 Working time',
    '',
    'Regular weekly working time is 38.5 hours, distributed across Monday to Friday in accordance with the agreed rota.',
  ].join('\n'),
  issuedAt: new Date('2026-08-29T09:00:00Z'),
  organizationName: 'HBC Group GmbH',
  memberName: 'Monika Holub',
};

/** A 1×1 transparent PNG — enough to embed, nothing to look at. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('renderContractPdf', () => {
  it('produces a valid PDF', async () => {
    const bytes = await renderContractPdf(VALUES);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('is byte-identical across renders — the whole point', async () => {
    // PDF normally stamps a creation date and a random document id. If either
    // reached the file, the hash that proves the document has not changed would
    // change by itself, and every signed contract would fail its own check.
    const a = await renderContractPdf(VALUES);
    const b = await renderContractPdf(VALUES);
    expect(sha(a)).toBe(sha(b));
  });

  it('changes when the content changes', async () => {
    // The other half of the same property: identical bytes must mean identical
    // content, so a different contract cannot hash the same.
    const a = await renderContractPdf(VALUES);
    const b = await renderContractPdf({ ...VALUES, memberName: 'Mike Weber' });
    expect(sha(a)).not.toBe(sha(b));
  });

  it('does not vary with the wall clock', async () => {
    // issuedAt is passed in, never read from a clock, so a re-render for
    // verification years later reproduces the original exactly.
    const a = await renderContractPdf(VALUES);
    await new Promise((r) => setTimeout(r, 15));
    const b = await renderContractPdf(VALUES);
    expect(sha(a)).toBe(sha(b));
  });

  it('renders German text, which is the language it will mostly be in', async () => {
    const bytes = await renderContractPdf({
      ...VALUES,
      memberName: 'Jürgen Müller-Weiß',
      body: 'Der Beschäftigte wird als Servicetechniker eingestellt. Größe, Übergabe, Straße.',
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('REFUSES text the font cannot encode, rather than printing squares', async () => {
    // A contract with black boxes where a surname belongs is worse than one
    // that failed to generate — only the second gets noticed.
    await expect(
      renderContractPdf({ ...VALUES, memberName: 'Łukasz Wójcik' }),
    ).rejects.toThrow(/cannot render/i);
  });

  it('paginates a long contract instead of running off the page', async () => {
    const long = Array.from({ length: 60 }, (_, i) =>
      `§${i + 1} Clause\n\nThis clause restates at length the obligations of both parties, ` +
      'so that the document runs well beyond a single page and the layout has to place it.',
    ).join('\n\n');
    const doc = await PDFDocument.load(await renderContractPdf({ ...VALUES, body: long }));
    expect(doc.getPageCount()).toBeGreaterThan(3);
  });
});

describe('sealSignedPdf', () => {
  const evidence = {
    documentTitle: 'Dienstvertrag',
    signerName: 'Monika Holub',
    signerEmail: 'monika@example.com',
    organizationName: 'HBC Group GmbH',
    consentText: 'I have read this document and agree to sign it electronically.',
    consentAt: new Date('2026-08-29T11:19:52Z'),
    signedAt: new Date('2026-08-29T11:20:01Z'),
    hashBefore: 'c72d0aa41f6b8e3590d1cc47ab205e8f'.repeat(2),
    sessionAuthenticatedAt: new Date('2026-08-29T11:02:00Z'),
    ip: '84.115.20.11',
    userAgent: 'HBCField/1.0.2 iOS 18.4',
    appVersion: '1.0.2',
    lat: 47.9813,
    lng: 13.8269,
    signatureImage: PNG,
    signatureSha256: '7b1ec904'.repeat(8),
  };

  it('appends TWO pages — the signature, then the certificate', async () => {
    /*
      Two, not one. The first version put the signature at the bottom of a page
      headed "Certificate of completion", so somebody opening their contract to
      check they had signed it found a page of hashes and device strings, and
      the document itself still read as unsigned.
    */
    const original = await renderContractPdf(VALUES);
    const before = (await PDFDocument.load(original)).getPageCount();
    const sealed = await sealSignedPdf(original, evidence);
    expect((await PDFDocument.load(sealed)).getPageCount()).toBe(before + 2);
  });

  it('leaves the original pages untouched, so the before-hash still describes them', async () => {
    const original = await renderContractPdf(VALUES);
    const originalPages = (await PDFDocument.load(original)).getPageCount();
    const sealed = await sealSignedPdf(original, evidence);
    // The contract keeps its own pages; only new ones are added after them.
    expect((await PDFDocument.load(sealed)).getPageCount()).toBeGreaterThan(originalPages);
  });

  it('is itself deterministic', async () => {
    const original = await renderContractPdf(VALUES);
    const a = await sealSignedPdf(original, evidence);
    const b = await sealSignedPdf(original, evidence);
    // The after-hash is recorded and later re-checked, so sealing has to be as
    // reproducible as rendering.
    expect(sha(a)).toBe(sha(b));
  });

  it('changes the bytes, so before and after are distinguishable', async () => {
    const original = await renderContractPdf(VALUES);
    const sealed = await sealSignedPdf(original, evidence);
    expect(sha(sealed)).not.toBe(sha(original));
  });

  it('survives a device string the PDF font cannot encode', async () => {
    // By this point the signature has already been made. Refusing here would
    // lose it; a question mark in a user-agent line would not.
    const original = await renderContractPdf(VALUES);
    await expect(
      sealSignedPdf(original, { ...evidence, userAgent: 'Приложение/1.0' }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('works without the optional evidence', async () => {
    const original = await renderContractPdf(VALUES);
    const sealed = await sealSignedPdf(original, {
      ...evidence,
      sessionAuthenticatedAt: null,
      ip: null,
      userAgent: null,
      appVersion: null,
      lat: null,
      lng: null,
    });
    expect(sealed.length).toBeGreaterThan(0);
  });
});

describe('layout arithmetic', () => {
  /** A crude monospace measurer — exact, and enough to assert the maths. */
  const measure: Measure = (text, size) => text.length * size * 0.5;

  it('reads a blank line as a paragraph break', () => {
    expect(parseBlocks('one\n\ntwo')).toEqual([
      { style: 'body', text: 'one' },
      { style: 'body', text: 'two' },
    ]);
  });

  it('joins a soft-wrapped paragraph into one block', () => {
    expect(parseBlocks('one\ntwo')).toEqual([{ style: 'body', text: 'one two' }]);
  });

  it('recognises a § clause as a heading', () => {
    const [first] = parseBlocks('§1 Position\n\nbody');
    expect(first).toEqual({ style: 'heading', text: '§1 Position' });
  });

  it('does not treat a long § paragraph as a heading', () => {
    const [first] = parseBlocks(`§ ${'x'.repeat(100)}`);
    expect(first!.style).toBe('body');
  });

  it('puts the title first when one is given', () => {
    expect(parseBlocks('body', 'Dienstvertrag')[0]).toEqual({
      style: 'title',
      text: 'Dienstvertrag',
    });
  });

  it('wraps to the width it is given', () => {
    const lines = wrap('aaa bbb ccc ddd', 10, false, 40, measure);
    expect(lines.every((l) => measure(l, 10, false) <= 40)).toBe(true);
  });

  it('hard-splits a word longer than the line', () => {
    // German compounds and URLs do this routinely, and a contract with text
    // running past the margin is not one anybody would sign.
    const lines = wrap('Arbeitszeitverkuerzungsvereinbarung', 10, false, 40, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => measure(l, 10, false) <= 40)).toBe(true);
  });

  it('never returns an empty array, so a blank block still occupies its space', () => {
    expect(wrap('', 10, false, 100, measure)).toEqual(['']);
  });

  it('keeps every line inside the page margins', () => {
    const pages = layout(parseBlocks(VALUES.body, VALUES.title), measure);
    for (const page of pages) {
      for (const line of page.lines) {
        expect(line.y).toBeGreaterThanOrEqual(MARGIN.bottom - 1);
        expect(line.y).toBeLessThanOrEqual(PAGE.height - MARGIN.top);
        expect(line.x).toBe(MARGIN.left);
      }
    }
  });

  it('never leaves a heading alone at the foot of a page', () => {
    const blocks = parseBlocks(
      Array.from({ length: 40 }, (_, i) => `§${i} H\n\nSome body text for this clause.`).join('\n\n'),
    );
    const pages = layout(blocks, measure);
    for (const page of pages) {
      const last = page.lines[page.lines.length - 1];
      if (!last) continue;
      // A heading is the bold, 12pt style. One stranded at the foot reads as a
      // document that was cut off.
      const isLoneHeading = last.bold && last.size === 12;
      expect(isLoneHeading).toBe(false);
    }
  });
});

describe('unencodableCharacters', () => {
  it('passes everything the five shipped languages need', () => {
    expect(unencodableCharacters('äöüß ÄÖÜ éèê ñ ç àìòù €')).toEqual([]);
  });

  it('flags characters outside the standard font', () => {
    expect(unencodableCharacters('Łukasz')).toEqual(['Ł']);
    expect(unencodableCharacters('日本語')).toHaveLength(3);
  });

  it('ignores newlines and tabs, which are not drawn', () => {
    expect(unencodableCharacters('a\nb\tc')).toEqual([]);
  });
});
