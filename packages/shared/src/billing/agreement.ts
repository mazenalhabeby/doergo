/**
 * An agreed price: one number that REPLACES an organization's computed bill.
 *
 * Some customers do not pay the price list. A pilot, a partner, a founding
 * customer, a company that negotiated hard — the bill computes to €863 and what
 * they actually pay is €120, because that is what was agreed with a person.
 *
 * WHY THIS IS NOT A DISCOUNT, AND NOT A STRIPE COUPON.
 *
 * A coupon is a percentage or an amount OFF, so the price moves every time the
 * customer adds a seat — which is the one thing a fixed price exists to prevent.
 * It would also break the invariant this billing system is built on: what Stripe
 * is told equals what the screen shows, to the cent. With a coupon the screen
 * would have to re-implement Stripe's discount-and-tax arithmetic and stay in
 * step with it forever.
 *
 * So the agreement replaces the TOTAL, and it is applied in exactly one place —
 * the end of the bill computation. Everything downstream then reads the same
 * number with no code of its own: the Stripe lines, the stored `lastBilledCents`
 * (and therefore MRR on the operator console), and the customer's own billing
 * page. There is no second source of truth to drift.
 *
 * WHAT IT DOES NOT TOUCH. Access. An agreement is about money, and nothing about
 * what the organization is allowed to do is decided here — the module list and
 * the option list keep deciding that, exactly as before. An organization paying
 * €120 for €863 of product still HAS €863 of product; that is the deal.
 */

/** The agreement as it is stored on the organization. */
export interface PriceAgreement {
  /** What they pay each month, in EUR cents. Replaces the computed total. */
  monthlyCents: number;
  /**
   * What the bill computed to when the price was agreed.
   *
   * ⚠️ This is what drift is measured against — NOT the agreed price. €120
   * against €863 is not drift, it is the deal that was struck, and an alert
   * comparing the two would fire on the day it was set and every day after,
   * which is the same as having no alert. What matters is the list price moving
   * AFTER the handshake: €863 → €1,240 means they grew, and somebody should
   * decide whether the deal still holds.
   */
  listCentsAtAgreement: number | null;
  /** When the term ends. Null = open-ended. See `agreementApplies` — it does NOT expire the price. */
  until: Date | string | null;
  /** Why, and with whom. Free text, recorded with the operator's id. */
  note: string | null;
  setAt: Date | string | null;
  setById: string | null;
}

/** The columns as Prisma returns them. */
export interface AgreementColumns {
  agreedMonthlyCents?: number | null;
  agreedListCents?: number | null;
  agreedUntil?: Date | string | null;
  agreedNote?: string | null;
  agreedSetAt?: Date | string | null;
  agreedSetById?: string | null;
}

/**
 * Read an agreement off an organization row, or null if there is none.
 *
 * The amount is the only field that decides whether an agreement EXISTS — a
 * term, a note and an author are all optional, and treating a row with a note
 * but no amount as an agreement would charge somebody nothing.
 */
export function agreementFrom(org: AgreementColumns | null | undefined): PriceAgreement | null {
  const cents = org?.agreedMonthlyCents;
  if (cents == null || !Number.isFinite(cents)) return null;
  return {
    monthlyCents: Math.max(0, Math.round(cents)),
    listCentsAtAgreement: org?.agreedListCents ?? null,
    until: org?.agreedUntil ?? null,
    note: org?.agreedNote ?? null,
    setAt: org?.agreedSetAt ?? null,
    setById: org?.agreedSetById ?? null,
  };
}

/**
 * Does the agreed price apply right now?
 *
 * It does, always, including past its own end date.
 *
 * ⚠️ This is deliberate and it is the single most consequential decision in this
 * file. Reverting on the expiry date would take a customer from €120 to €863 on
 * one invoice, with no conversation, because a date passed in a database — a
 * support incident at best and a chargeback at worst. Expiry raises an ALERT
 * thirty days out (see `agreementEndsWithin`) and an operator decides. A price
 * that changes itself is a price nobody can promise a customer.
 */
export function agreementApplies(agreement: PriceAgreement | null | undefined): boolean {
  return agreement != null;
}

/**
 * The largest agreed price that can be entered, in cents (€1,000,000).
 *
 * Not a business rule — a fat-finger guard. An operator typing an amount in
 * cents where euros were meant is the realistic error, and it is silent: the
 * customer's next invoice is a hundred times too large and Stripe charges it.
 */
export const AGREED_PRICE_MAX_CENTS = 100_000_000;

/** Longest note kept. Long enough for the deal, short enough for a table cell. */
export const AGREED_NOTE_MAX = 500;

/**
 * Clean an operator's input into something safe to store.
 *
 * Returns the value, or a refusal with the reason to show them. A price this
 * powerful is worth refusing loudly rather than clamping quietly — clamping
 * would accept "12000000" and store a different number than the one they read
 * back to the customer on the phone.
 */
export function validateAgreedPrice(input: {
  monthlyCents: unknown;
  until?: unknown;
  note?: unknown;
}): { ok: true; monthlyCents: number; until: Date | null; note: string | null } | { ok: false; message: string } {
  const cents = Number(input.monthlyCents);
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    return { ok: false, message: 'The agreed price must be a whole number of cents.' };
  }
  if (cents < 0) return { ok: false, message: 'The agreed price cannot be negative.' };
  if (cents > AGREED_PRICE_MAX_CENTS) {
    return { ok: false, message: `That is over €${(AGREED_PRICE_MAX_CENTS / 100).toLocaleString()} a month — check the amount is in euros, not cents.` };
  }

  let until: Date | null = null;
  if (input.until != null && input.until !== '') {
    const d = new Date(input.until as string);
    if (Number.isNaN(d.getTime())) return { ok: false, message: 'That end date is not a date.' };
    // A term that has already ended would open with an expiry alert already due.
    if (d.getTime() < Date.now()) return { ok: false, message: 'That end date is in the past.' };
    until = d;
  }

  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, AGREED_NOTE_MAX) : null;
  return { ok: true, monthlyCents: cents, until, note };
}

/*
  When has a contracted customer outgrown their deal?

  The same two-test shape as `isMaterialDrop`, and for the same reason: one
  threshold cannot serve a €90 customer and a €10,000 one. A percentage alone
  screams at a small organization adding one seat; an absolute alone never fires
  for them at all.

  Measured against the list price AT THE AGREEMENT, never against the agreed
  price — see PriceAgreement.listCentsAtAgreement.
*/
export const AGREEMENT_DRIFT_MIN_CENTS = 5_000; // €50 — below this, nobody would act
export const AGREEMENT_DRIFT_MIN_RATIO = 0.25; // a quarter more product than was agreed
export const AGREEMENT_DRIFT_BIG_CENTS = 20_000; // €200 more, at any percentage

export function isMaterialAgreementDrift(listAtAgreementCents: number | null, listNowCents: number): boolean {
  if (listAtAgreementCents == null || listAtAgreementCents <= 0) return false;
  const grew = listNowCents - listAtAgreementCents;
  if (grew < AGREEMENT_DRIFT_MIN_CENTS) return false;
  return grew / listAtAgreementCents >= AGREEMENT_DRIFT_MIN_RATIO || grew >= AGREEMENT_DRIFT_BIG_CENTS;
}

/** How many days before a term ends we want it in front of an operator. */
export const AGREEMENT_ENDING_NOTICE_DAYS = 30;

/**
 * Is this agreement's term ending soon — or already over?
 *
 * Already-over counts, because the price is still being honoured (see
 * `agreementApplies`) and an expired term that nobody was told about is exactly
 * the thing this is for.
 */
export function agreementEndsWithin(
  agreement: PriceAgreement | null | undefined,
  days = AGREEMENT_ENDING_NOTICE_DAYS,
  now: Date = new Date(),
): boolean {
  if (!agreement?.until) return false;
  const end = new Date(agreement.until).getTime();
  if (Number.isNaN(end)) return false;
  return end - now.getTime() <= days * 86_400_000;
}

/**
 * Apply an agreed price to a computed bill. The one place a price is overridden.
 *
 * Returns a NEW bill rather than mutating: the same computed object is handed to
 * the Stripe layer and to the screen, and a function that quietly rewrote its
 * argument would make the order of those two calls decide what a customer is
 * charged.
 *
 * Everything except the total is left exactly as it was. The workspaces, the
 * modules, the options and the seats are all still listed at their real prices,
 * because they are what the organization is getting — and a billing page that
 * deleted them to show one number would read as though the product had shrunk.
 */
export function applyAgreement<
  T extends { monthlyCents: number; listMonthlyCents: number; agreement?: unknown },
>(bill: T, agreement: PriceAgreement | null | undefined): T {
  if (!agreementApplies(agreement)) return bill;
  const a = agreement!;
  return {
    ...bill,
    monthlyCents: a.monthlyCents,
    // Never overwritten — this is what the bill computed to, and three other
    // things depend on still being able to read it.
    listMonthlyCents: bill.listMonthlyCents,
    agreement: {
      monthlyCents: a.monthlyCents,
      until: a.until ? new Date(a.until).toISOString() : null,
      note: a.note ?? null,
      listCentsAtAgreement: a.listCentsAtAgreement,
    },
  };
}
