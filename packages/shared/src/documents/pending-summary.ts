/**
 * What one reminder should say when several kinds of thing are outstanding.
 *
 * A member can owe the organization two different things at once — a document
 * they have to SUPPLY, and one already issued to them that is waiting to be
 * SIGNED — and each lives in a different table with a different lifecycle. The
 * naive answer is a card for each, which doubles the space a piece of admin
 * takes on a home screen it does not deserve. The correct answer is one line
 * that changes what it says.
 *
 * Pure and shared because web and mobile must not disagree. Two implementations
 * of "how do we phrase three outstanding things" drift within a release, and
 * the drift shows up as two different counts for the same person on two
 * screens, which is exactly the sort of thing that stops people believing any
 * of it.
 *
 * Returns a bare key name, not a full i18n path: the rule about WHAT to say
 * belongs here, and where a translation lives belongs to each app.
 */

export type PendingTitle =
  /** Both kinds at once — the count is everything, the parts go underneath. */
  | 'needYou'
  /** Only documents to supply. */
  | 'needed'
  /** Only documents to sign. */
  | 'toSign'
  /** Nothing outstanding; something merely runs out soon. */
  | 'expiring';

export interface PendingSummary {
  /** Nothing to say at all — the normal case, and the reminder renders nothing. */
  empty: boolean;
  titleKey: PendingTitle;
  /** The number the title is about. */
  count: number;
  uploadCount: number;
  signCount: number;
  expiringCount: number;
  /**
   * What is actually waiting on the member — uploads plus signatures, never
   * expiries. This is the number a permanent badge should carry: a certificate
   * that runs out in three weeks is not something anybody is late for, and a
   * badge that lights up for it teaches people to ignore the badge.
   */
  actionCount: number;
  /**
   * Both kinds are outstanding, so the line underneath must break the count
   * down rather than list names — "2 to upload · 1 to sign" tells somebody what
   * they are in for; six names in a two-line space tells them nothing.
   */
  mixed: boolean;
  /** What to name underneath when there is only one kind. Never truncated here. */
  names: string[];
  /** At least one of them stops work being assigned. */
  blocksWork: boolean;
}

export function summarisePending(input: {
  toUpload: { label: string; blocksWork?: boolean }[];
  toSign: { title: string }[];
  expiring: { label: string }[];
}): PendingSummary {
  const uploadCount = input.toUpload.length;
  const signCount = input.toSign.length;
  const expiringCount = input.expiring.length;
  const blocksWork = input.toUpload.some((r) => r.blocksWork === true);

  const empty = uploadCount === 0 && signCount === 0 && expiringCount === 0;
  const mixed = uploadCount > 0 && signCount > 0;

  /*
    Expiry is only ever the headline when nothing is actually outstanding.
    A certificate running out in three weeks next to a document that is missing
    today is noise: it competes for the one line that should be telling somebody
    about the thing that is already wrong.
  */
  const titleKey: PendingTitle =
    mixed ? 'needYou'
    : uploadCount > 0 ? 'needed'
    : signCount > 0 ? 'toSign'
    : 'expiring';

  const count =
    mixed ? uploadCount + signCount
    : uploadCount > 0 ? uploadCount
    : signCount > 0 ? signCount
    : expiringCount;

  const names =
    mixed ? []
    : uploadCount > 0 ? input.toUpload.map((r) => r.label)
    : signCount > 0 ? input.toSign.map((d) => d.title)
    : input.expiring.map((r) => r.label);

  return {
    empty, titleKey, count,
    uploadCount, signCount, expiringCount,
    actionCount: uploadCount + signCount,
    mixed, names, blocksWork,
  };
}
