import { BadRequestException } from '@nestjs/common';
import { retentionUntil, type checkScan } from '@hbcfield/shared';
import { MAX_PAGES } from './pages-pdf';

import { type SubmitOwnDocumentInput } from '@hbcfield/shared/microservices';
/** The message contract's type (shared with the gateway). */
export type { SubmitOwnDocumentInput };

export type OwnScan = ReturnType<typeof checkScan>;

/**
 * The typed expiry: unreadable or absurdly far out is refused, missing is fine.
 *
 * ⚠️ A MISSING EXPIRY NO LONGER REFUSES THE DOCUMENT — deliberately.
 *
 * This is the member's OWN path: somebody in a van holding a licence, whose
 * photograph the reader could not get a date out of. Refusing it means the
 * document is not filed at all, and an unfiled licence is worth strictly
 * less than a filed one with a date still to be confirmed.
 *
 * The date is not abandoned, it MOVES. A supplied document goes to the
 * verification queue where a person is already looking at the image at a
 * desk, and `verifyDocument` will not approve a type that has an expiry
 * until they supply one. The obligation now sits with whoever can actually
 * satisfy it.
 *
 * ⚠️ The office path (document issuing) still insists, and should: nothing reviews
 * it afterwards, so a date missing there is missing for good.
 */
export function parseOwnExpiry(expiresOnText: string | null | undefined): Date | null {
  const expiresOn = expiresOnText ? new Date(expiresOnText) : null;
  if (expiresOn && Number.isNaN(expiresOn.getTime())) {
    throw new BadRequestException('That expiry date could not be read');
  }
  /*
    A date far enough out to be a typo rather than a certificate.

    Deliberately one-sided: an expiry in the PAST is allowed. Somebody
    uploading a lapsed licence alongside its replacement is doing the right
    thing, and the compliance board already reads it as expired — refusing it
    would only mean the office never sees the lapse.
  */
  if (expiresOn && expiresOn.getFullYear() > new Date().getFullYear() + 50) {
    throw new BadRequestException('That expiry date is too far in the future');
  }
  return expiresOn;
}

/** The further sheets, refused when combined with a reverse or past the page limit. */
export function extraSheets(data: Pick<SubmitOwnDocumentInput, 'pageStagingKeys' | 'backStagingKey'>): string[] {
  const extraPages = (data.pageStagingKeys ?? []).filter(Boolean);
  if (extraPages.length > 0 && data.backStagingKey) {
    throw new BadRequestException('A document is either two-sided or many sheets, not both');
  }
  if (extraPages.length + 1 > MAX_PAGES) {
    throw new BadRequestException(`A document may hold at most ${MAX_PAGES} pages`);
  }
  return extraPages;
}

/*
  A date READ off the document beats one typed into a form.

  The typed date was the weakest link in the chain: nothing checked it, so a
  mistyped year sat on the compliance board as fact. When the zone carries
  an expiry and its check digit agrees, that is the date — and a member who
  typed a different one has just told us something a reviewer should see.
*/
export function scannedExpiryOf(scan: OwnScan | null): Date | null {
  return scan?.verdict !== 'SUSPECT' && scan?.extracted.dateOfExpiry ? new Date(scan.extracted.dateOfExpiry) : null;
}

/** The new document row: the member's own, waiting for verification. */
export function ownDocumentRow(args: {
  data: SubmitOwnDocumentInput;
  type: { id: string; label: string; retentionMonths: number | null };
  filed: { key: string; hash: string; sizeBytes: number; mimeType: string };
  scan: OwnScan | null;
  issuedAt: Date;
  expiresOn: Date | null;
}) {
  const { data, type, filed, scan, issuedAt } = args;
  return {
    ...(data.id ? { id: data.id } : {}),
    organizationId: data.actor.organizationId,
    userId: data.actor.userId,
    typeId: type.id,
    title: data.title?.trim() || type.label,
    storageKey: filed.key,
    sha256: filed.hash,
    /*
      The same object, recorded twice on purpose.

      storageKey moves to the sealed copy each time somebody signs;
      originalKey never moves. Re-rendering from the original is what
      keeps a three-party document at one signature block and one
      certificate instead of six appended pages.
    */
    originalKey: filed.key,
    originalSha256: filed.hash,
    sizeBytes: filed.sizeBytes,
    mimeType: filed.mimeType,
    status: 'PENDING_VERIFICATION' as const,
    ...(scan
      ? {
          scanFormat: scan.format,
          scanVerdict: scan.verdict,
          scanData: scan.extracted as object,
          scanChecks: scan.checks as unknown as object,
          holderName: scan.extracted.holderName,
          documentNumber: scan.extracted.documentNumber,
          dateOfBirth: scan.extracted.dateOfBirth ? new Date(scan.extracted.dateOfBirth) : null,
          issuingState: scan.extracted.issuingState,
        }
      : {}),
    // NOT `issuedById`: nobody issued this. The member supplied it, and
    // the trail below is what says so.
    issuedAt,
    expiresOn: scannedExpiryOf(scan) ?? args.expiresOn,
    retentionUntil: retentionUntil(issuedAt, type.retentionMonths),
  };
}
