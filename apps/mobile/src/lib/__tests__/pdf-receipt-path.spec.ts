import fs from 'fs';
import path from 'path';

/*
  A PDF receipt is read by the SERVER; an image is read by the PHONE.

  ⚠️ Not an arbitrary split. On-device OCR reads pixels, and a PDF has none
  until something renders it — no phone build here carries a renderer. Yet a PDF
  is what a supplier EMAILS, which makes it the likeliest shape for exactly the
  invoices worth the most money, and until this existed the only way to file one
  was to photograph a screen.

  The other direction matters just as much: an IMAGE must never be sent to the
  server to be read. The local reader is better than anything the server could
  run on the same photograph, it is free, and it works at a pump on one bar of
  signal. Sending it would trade a good answer for a worse one plus a round trip.

  What both paths share is the MEANING: `parseReceipt` in `packages/shared`,
  the same rules whichever machine did the reading.
*/

const MOBILE = path.join(__dirname, '../../..');
const GATEWAY = path.join(MOBILE, '../api/gateway');
const TASK = path.join(MOBILE, '../api/task-service');
const read = (p: string) => fs.readFileSync(p, 'utf8');
/*
  ⚠️ A STRING CAN LOOK LIKE A COMMENT. The screen this scans contains a media
  type filter written as 'image' followed by a slash and a star — and a naive
  stripper reads that slash-star as a comment OPENER, then deletes everything
  up to the next closer. Here that was forty lines of the code under test, so
  the guard failed on source that was perfectly correct and the fix looked like
  loosening the assertion.

  (This comment could not quote the closing sequence either: doing so ended the
  comment early and left the rest of the paragraph as code. The trap is real in
  both directions.)

  Requiring the opener to follow whitespace or a line start is enough: a comment
  is written that way and a path segment never is.
*/
const stripComments = (s: string) =>
  s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[^:/])\/\/[^\n]*/g, '$1');

const SCREEN = path.join(MOBILE, 'app/(app)/asset-expense.tsx');

describe('the phone sends a PDF up and keeps an image', () => {
  const src = () => stripComments(read(SCREEN));

  it('offers a file as well as the camera', () => {
    expect(src()).toContain('DocumentPicker.getDocumentAsync');
    expect(src()).toContain('expenses.chooseFile');
  });

  it('still offers the camera and typing it in — a PDF is the rarer case', () => {
    // The primary path is what a driver at a pump has in their hand.
    expect(src()).toContain('expenses.typeInstead');
    expect(src()).toMatch(/camera\.current\.takePictureAsync/);
  });

  it('reads an image on the device, never over the wire', () => {
    const s = src();
    // The non-PDF branch calls the local reader…
    expect(s).toMatch(/mime !== 'application\/pdf'[\s\S]{0,400}scanReceipt\(/);
    // …and the remote read is reached only after a PDF presign.
    const remote = s.indexOf('readReceipt(');
    const pdfPresign = s.indexOf("mimeType: 'application/pdf'");
    expect(pdfPresign).toBeGreaterThan(-1);
    expect(remote).toBeGreaterThan(pdfPresign);
  });

  it('uploads the PDF once, not twice', () => {
    // It has to go up before the amount is typed, because the server cannot
    // read what it cannot see. Submitting must reuse that key.
    const s = src();
    expect(s).toContain('setUploadedKey(');
    expect(s).toMatch(/if \(uploadedKey\)[\s\S]{0,200}receiptKey = uploadedKey/);
  });

  it('forgets the key when the file is discarded', () => {
    // Otherwise the previous PDF is attached to the next receipt.
    expect(src()).toMatch(/discardShot[\s\S]{0,200}setUploadedKey\(null\)/);
  });
});

describe('the server reads the file, and is allowed to by custody', () => {
  it('the route carries no permission — custody is the authorisation', () => {
    /*
      ⚠️ Same reasoning as filing an expense: a driver is not an asset manager
      and never will be. `canManageAssets` on this route would lock every driver
      out of the one screen built for them. What the service checks is who HELD
      the asset on the receipt's own date.
    */
    const ctrl = stripComments(read(path.join(GATEWAY, 'src/modules/assets/assets.controller.ts')));
    const at = ctrl.indexOf("@Post(':id/expenses/read')");
    expect(at).toBeGreaterThan(-1);
    const decorators = ctrl.slice(Math.max(0, at - 400), at);
    expect(decorators).not.toMatch(/@RequirePermission[^\n]*\n[^\n]*$/);
  });

  it('refuses a key that is not this organization’s and this asset’s', () => {
    // Without it the route reads any object in the bucket whose key can be
    // guessed. The same check `submit` makes.
    const svc = stripComments(read(path.join(TASK, 'src/modules/assets/asset-expense.service.ts')));
    expect(svc).toMatch(/readReceipt[\s\S]{0,2000}startsWith\(this\.prefix\(/);
  });

  it('asks custody on the RECEIPT’s date, not today', () => {
    const svc = stripComments(read(path.join(TASK, 'src/modules/assets/asset-expense.service.ts')));
    expect(svc).toMatch(/readReceipt[\s\S]{0,600}readAssetEntryDate\(data\.occurredAt, data\)[\s\S]{0,200}this\.gate\(/);
  });

  it('declines an image rather than reading it worse', () => {
    const svc = stripComments(read(path.join(TASK, 'src/modules/assets/asset-expense.service.ts')));
    expect(svc).toContain("'NOT_A_PDF'");
  });

  it('uses the SAME rules as the phone', () => {
    // A second "which figure is the total" is how one surface starts
    // disagreeing with the other about the same invoice.
    const svc = stripComments(read(path.join(TASK, 'src/modules/assets/asset-expense.service.ts')));
    expect(svc).toContain('parseReceipt');
    expect(svc).toMatch(/from '@hbcfield\/shared'/);
  });
});
