import { OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Document bodies (CODE_AUDIT.md B3), including the PUBLIC signing link (/documents/link/*,
  the web's /sign page). Only TYPES are checked; the token is still verified by the service,
  and a missing value still reaches it (it answers the same refusal for every bad link).
*/

/** POST /documents/link */
export class LinkOpenDto {
  @OptString() token!: string;
}

/** POST /documents/link/file */
export class LinkFileDto {
  @OptString() token!: string;
  @OptString() signerId!: string;
}

/** POST /documents/link/submit */
export class LinkSubmitDto {
  @OptString() token!: string;
  @OptStrings() signerIds!: string[];
  @OptString() signatureImage!: string;
  @OptString() name!: string;
  @OptString() role?: string | null;
  @OptString() idempotencyKey!: string;
}

/** POST /documents/link/resend */
export class LinkResendDto {
  @OptString() email!: string;
}

/** POST /documents/export — {} for the caller's own file, { userId } for a member's. */
export class ExportDocumentsDto {
  @OptString() userId?: string;
}

/** POST /documents/:id/verify — the web and the approvals inbox send { expiresOn? }. */
export class VerifyDocumentDto {
  @OptString() expiresOn?: string | null;
}
