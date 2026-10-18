import { OptIn, OptNumber, OptString } from '../../../common/dto/body-fields';

/*
  Asset bodies that used to be plain interfaces (CODE_AUDIT.md B3): every field the web and
  the approvals inbox send is declared, and only its TYPE is checked — the service refuses a
  missing or wrong value with its own coded message.
*/

/** POST /assets/expenses/:entryId/review — the web and the inbox send { decision, note? }. */
export class ReviewExpenseDto {
  @OptIn(['accept', 'reject']) decision?: 'accept' | 'reject';
  @OptString() note?: string;
}

/** POST /assets/proposals/:id/reject — { note? } (web and inbox). */
export class RejectProposalDto {
  @OptString() note?: string;
}

/** POST /assets/:id/activities — { body }. */
export class AssetActivityDto {
  @OptString() body?: string;
}

/** POST /assets/:id/money — the Money tab sends category, amountCents (NaN → null), note. */
export class AssetMoneyDto {
  @OptString() category?: string;
  @OptNumber() amountCents?: number;
  @OptString() note?: string;
  @OptString() occurredAt?: string;
}
