/** Sealing a signed contract: the evidence page — who signed, when, from which device — and the final file. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MARGIN, PAGE } from '@hbcfield/shared';
import { describeDevice, drawFooter, longDate, sanitise } from './render';

/**
 * Append the signature block and the certificate of completion, then freeze.
 *
 * TWO pages, not one, and the distinction matters:
 *
 *   SIGNATURE   — reads as part of the contract. The mark, on a rule, with the
 *                 name and date beneath it, the way a signed page looks on
 *                 paper. This is what somebody opening their contract expects
 *                 to find, and the first version buried it at the bottom of a
 *                 page headed "Certificate of completion", so the document
 *                 itself still read as unsigned.
 *
 *   CERTIFICATE — the record of HOW it was signed: consent, device, hashes.
 *                 Evidence, not contract.
 *
 * Neither touches the original pages, so the before-hash still describes
 * exactly what the signer read.
 */
/**
 * One person's signature, as the sealed document records it.
 *
 * `role` is the label printed beside the mark — "Worker", "Responsible",
 * "Customer" — because a block of three signatures is unreadable if the reader
 * cannot tell which is which.
 *
 * `strength` is the honest part. A signer who was already authenticated is a
 * different claim from somebody who followed an emailed link: the first says
 * WHO signed, the second says the link was used. Both are legitimate; printing
 * them identically would overstate the weaker one.
 */
interface SignerEvidence {
  role: string;
  signerName: string;
  signerEmail: string;
  consentText: string;
  consentAt: Date;
  signedAt: Date;
  hashBefore: string;
  sessionAuthenticatedAt?: Date | null;
  ip?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** PNG bytes of the drawn signature. */
  signatureImage: Buffer;
  signatureSha256: string;
  strength?: 'SESSION' | 'LINK';
}

interface SealEvidence {
  documentTitle: string;
  organizationName: string;
  /** In signing order. One entry for a document nobody else has to sign. */
  signers: SignerEvidence[];
}

/**
 * Seal a document with every signature it has collected.
 *
 * Rendered from the ORIGINAL each time, never from the previously sealed file.
 * Appending to the sealed copy would add a signature page and a certificate per
 * signer, so a three-party time sheet would carry six pages of apparatus behind
 * one page of content. Re-rendering gives one signature block and one
 * certificate however many people sign.
 *
 * That is safe because the chain is kept in the hashes, not in the layout:
 * each signature records the document as its signer saw it (`hashBefore`) and
 * as it stood afterwards, so the sequence is provable even though the file is
 * redrawn.
 */
export async function sealSignedPdf(
  originalPdf: Buffer,
  evidence: SealEvidence,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(originalPdf);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const signers = evidence.signers;
  const images = await Promise.all(signers.map((s) => pdf.embedPng(s.signatureImage)));

  // ── The signature block ───────────────────────────────────────────────────
  //
  // One page holding every signature, laid out the way the block at the foot of
  // a paper time sheet always was. Each mark gets a rule, a name and the role
  // it was signing in.
  {
    const sig = pdf.addPage([PAGE.width, PAGE.height]);
    let sy = PAGE.height - MARGIN.top;

    sig.drawText(signers.length > 1 ? 'Signatures' : 'Signature', {
      x: MARGIN.left, y: sy, size: 18, font: bold, color: rgb(0.06, 0.09, 0.15),
    });
    sy -= 26;

    sig.drawText(sanitise(evidence.documentTitle), {
      x: MARGIN.left, y: sy, size: 11, font: regular, color: rgb(0.42, 0.48, 0.58),
    });
    sy -= 40;

    /*
      Sized to what is left, not to a fixed height.

      A block of one signature should be readable — this is the page somebody
      opens to check that they signed — while six must still fit. The mark
      shrinks as the block grows rather than the page overflowing.
    */
    const perSigner = Math.min(150, Math.max(86, (sy - MARGIN.bottom - 40) / signers.length));
    const boxW = 240;
    const boxH = Math.max(40, perSigner - 58);

    for (const [i, s] of signers.entries()) {
      const png = images[i];
      const scale = Math.min(boxW / png.width, boxH / png.height, 1);
      const w = png.width * scale;
      const h = png.height * scale;

      sy -= h;
      sig.drawImage(png, { x: MARGIN.left, y: sy, width: w, height: h });

      // Drawn at block width rather than image width, so a short signature does
      // not get a short line.
      sig.drawLine({
        start: { x: MARGIN.left, y: sy - 6 },
        end: { x: MARGIN.left + boxW, y: sy - 6 },
        thickness: 1,
        color: rgb(0.55, 0.6, 0.68),
      });
      sy -= 24;

      sig.drawText(sanitise(s.signerName), {
        x: MARGIN.left, y: sy, size: 11.5, font: bold, color: rgb(0.06, 0.09, 0.15),
      });
      // The role sits to the right of the name: three marks in a column are
      // indistinguishable without it.
      sig.drawText(sanitise(s.role.toUpperCase()), {
        x: MARGIN.left + boxW + 16, y: sy, size: 8.5, font: bold, color: rgb(0.55, 0.6, 0.68),
      });
      sy -= 14;

      sig.drawText(`${sanitise(s.signerEmail)}   ·   ${longDate(s.signedAt)}`, {
        x: MARGIN.left, y: sy, size: 9, font: regular, color: rgb(0.42, 0.48, 0.58),
      });
      sy -= 20;
    }

    sy -= 6;
    for (const line of [
      `Issued by ${evidence.organizationName}.`,
      'Signed electronically. The following page records how, and carries the',
      'fingerprint that shows the document has not been altered since.',
    ]) {
      sig.drawText(sanitise(line), {
        x: MARGIN.left, y: sy, size: 9, font: regular, color: rgb(0.42, 0.48, 0.58),
      });
      sy -= 14;
    }

    drawFooter(sig, regular, {
      left: `${evidence.organizationName} · signature`,
      right: `${pdf.getPageCount()}`,
    });
  }

  // ── The certificate page ──────────────────────────────────────────────────
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN.top;

  const text = (s: string, size: number, isBold = false, indent = 0) => {
    page.drawText(sanitise(s), {
      x: MARGIN.left + indent, y, size,
      font: isBold ? bold : regular, color: rgb(0.06, 0.09, 0.15),
    });
    y -= size + 6;
  };

  const muted = (s: string, size = 8.5, indent = 0) => {
    page.drawText(sanitise(s), {
      x: MARGIN.left + indent, y, size, font: regular, color: rgb(0.42, 0.48, 0.58),
    });
    y -= size + 5;
  };

  const VALUE_X = MARGIN.left + 86;
  const row = (label: string, value: string, size = 8.5) => {
    page.drawText(sanitise(label), {
      x: MARGIN.left, y, size, font: regular, color: rgb(0.55, 0.6, 0.69),
    });
    page.drawText(sanitise(value), {
      x: VALUE_X, y, size, font: regular, color: rgb(0.42, 0.48, 0.58),
    });
    y -= size + 5;
  };

  text('Certificate of completion', 16, true);
  y -= 6;
  muted(evidence.documentTitle);
  y -= 18;

  const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  for (const [i, s] of signers.entries()) {
    // Each signature is its own record. Numbered when there is more than one,
    // because the ORDER is part of what the chain asserts.
    text(signers.length > 1 ? `${i + 1}. ${s.role} — ${s.signerName}` : `${s.signerName}`, 11, true);
    y -= 2;
    muted(s.signerEmail, 8.5);

    row('Consent', stamp(s.consentAt));
    muted(`"${s.consentText}"`, 8.5, 86);
    row('Signed', stamp(s.signedAt));

    if (s.sessionAuthenticatedAt) {
      row('Session', `authenticated ${stamp(s.sessionAuthenticatedAt)}`);
    }
    /*
      What this signature is worth, said plainly.

      An authenticated signer and somebody who followed a link are different
      claims, and a page that presented them identically would be overstating
      the weaker one — on the document somebody would produce in a dispute.
    */
    if (s.strength === 'LINK') {
      row('Identity', 'by signing link — not an authenticated session');
    }
    if (s.ip) row('IP', s.ip);
    if (s.userAgent) {
      row('Device', describeDevice(s.userAgent));
      muted(s.userAgent, 7, VALUE_X - MARGIN.left);
    }
    if (s.appVersion) row('App', `HBCField ${s.appVersion}`);
    if (s.lat != null && s.lng != null) {
      row('Location', `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`);
    }
    y -= 10;
  }

  // ── The integrity chain ──────────────────────────────────────────────────
  text('Integrity', 11, true);
  y -= 2;
  if (signers.length > 1) {
    muted('Each signature records the document as its signer saw it, so the');
    muted('sequence below is what the chain asserts:');
    y -= 4;
    for (const [i, s] of signers.entries()) {
      row(`${i + 1}. before`, s.hashBefore, 7.5);
    }
  } else {
    muted('SHA-256 of the document as signed:');
    muted(signers[0]?.hashBefore ?? '', 8, 12);
  }
  muted('Signature image SHA-256:');
  for (const s of signers) muted(s.signatureSha256, 8, 12);
  y -= 10;

  for (const line of [
    'This page was appended when the document was signed. If the file still',
    'hashes to the value recorded against it, it has not been altered since.',
  ]) {
    muted(line);
  }

  drawFooter(page, regular, {
    left: `${evidence.organizationName} · certificate`,
    right: `${pdf.getPageCount()} / ${pdf.getPageCount()}`,
  });

  return Buffer.from(await pdf.save());
}
