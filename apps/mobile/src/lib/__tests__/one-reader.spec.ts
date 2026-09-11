import fs from 'fs';
import path from 'path';

/*
  ONE READER, ONE SET OF RULES — asked of the whole product.

  Reading a page happens in four places: a business card, a fuel receipt, a
  rental agreement, and a member's own certificate. They had drifted into three
  copies of the native binding plus a document flow with no reader at all, which
  uploaded the photograph and asked the SERVER to read it with tesseract while
  ML Kit sat unused in the same app.

  The split that has to hold: PIXELS are platform work (ML Kit on the phone, a
  text layer in the browser, tesseract on the server) and MEANING is one pure
  module in `packages/shared` that all three call. Anything else and the same
  licence gives a member three different dates depending where they file it.
*/

const MOBILE = path.join(__dirname, '../../..');
const WEB = path.join(MOBILE, '../web-app');
const AUTH = path.join(MOBILE, '../api/auth-service');

const read = (p: string) => fs.readFileSync(p, 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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

describe('the phone has one reader, and everything that reads uses it', () => {
  const files = ['src', 'app']
    .flatMap((d) => sourceFiles(path.join(MOBILE, d)))
    .filter((f) => !f.includes('__tests__'));

  it('nothing calls the native reader except the one module', () => {
    const offenders = files
      .filter((f) => path.relative(MOBILE, f) !== 'src/lib/ocr.ts')
      .filter((f) => /\brecognizeText\s*\(/.test(stripComments(read(f))))
      .map((f) => path.relative(MOBILE, f));
    expect(offenders).toEqual([]);
  });

  it('each of the four readers is a parser on top of it, not a second reader', () => {
    for (const f of ['card-scan.ts', 'receipt-scan.ts', 'document-scan.ts']) {
      const src = stripComments(read(path.join(MOBILE, 'src/lib', f)));
      expect({ f, usesShared: /from '\.\/ocr'/.test(src) }).toEqual({ f, usesShared: true });
      // No second capability cache — it was copied once already.
      expect({ f, ownCache: src.includes('isSupported()') }).toEqual({ f, ownCache: false });
    }
  });

  it('the document flow reads on the device before it uploads', () => {
    /*
      ⚠️ It uploaded first and asked the server. A member on a yard's worth of
      signal watched a spinner for the length of an upload to learn a date the
      phone in their hand could have read instantly — and read better, because
      ML Kit beats tesseract on a photographed page.
    */
    const sheet = stripComments(read(path.join(MOBILE, 'src/components/supply-document-sheet.tsx')));
    expect(sheet).toContain('readExpiryOnDevice');
    // Before the presign, not after the upload.
    expect(sheet.indexOf('readExpiryOnDevice')).toBeLessThan(sheet.indexOf('ownUploadUrl'));
  });

  it('a device read is never wiped by a server that found nothing', () => {
    // Losing a date already on screen because a second, weaker reader missed it
    // is the worst of both.
    const sheet = stripComments(read(path.join(MOBILE, 'src/components/supply-document-sheet.tsx')));
    expect(sheet).toMatch(/setDateSource\(\(prev\) =>/);
  });
});

describe('the meaning of a page is decided in one place', () => {
  it('all three platforms ask the same shared function for an expiry', () => {
    const callers: [string, string][] = [
      ['phone', path.join(MOBILE, 'src/lib/document-scan.ts')],
      ['browser', path.join(WEB, 'src/app/(dashboard)/my/documents/_components/supply-document-dialog.tsx')],
      ['server', path.join(AUTH, 'src/modules/documents/documents.service.ts')],
    ];
    for (const [where, file] of callers) {
      expect({ where, uses: stripComments(read(file)).includes('suggestExpiry') })
        .toEqual({ where, uses: true });
    }
  });

  it('nobody re-implements date-finding next to their reader', () => {
    // A second "which date is the expiry" is how one surface starts disagreeing
    // with another about the same licence.
    const suspects = [
      path.join(MOBILE, 'src/lib/document-scan.ts'),
      path.join(MOBILE, 'src/lib/receipt-scan.ts'),
      path.join(MOBILE, 'src/lib/card-scan.ts'),
    ];
    for (const f of suspects) {
      expect({ f: path.basename(f), regex: /\\d\{1,2\}\[\.\\-\/\]/.test(read(f)) })
        .toEqual({ f: path.basename(f), regex: false });
    }
  });

  it('the browser reads a PDF, because the server cannot', () => {
    /*
      Rasterising needs a renderer auth-service does not have. A text layer is
      better than OCR anyway — the characters the document was written with,
      not a guess at their shape — and the file is already in the browser.
    */
    const dialog = stripComments(read(
      path.join(WEB, 'src/app/(dashboard)/my/documents/_components/supply-document-dialog.tsx'),
    ));
    expect(dialog).toContain('extractPdfText');
    expect(dialog).toContain('application/pdf');
    // Lazily: pdf.js is ~1MB and must not tax opening the dialog.
    expect(dialog).toMatch(/await import\(["']@\/lib\/pdf-text["']\)/);
  });

  it('the PDF reader lives somewhere both screens can reach', () => {
    // It sat under `documents/_lib/`, used by one screen, one directory out of
    // reach of the other place in the product where somebody hands over a PDF.
    expect(fs.existsSync(path.join(WEB, 'src/lib/pdf-text.ts'))).toBe(true);
    expect(fs.existsSync(path.join(WEB, 'src/app/(dashboard)/documents/_lib/pdf-text.ts'))).toBe(false);
  });
});
