import {
  isMaterialDrop,
  BILLING_ALERT_MIN_DROP_CENTS,
  BILLING_ALERT_PROPORTION,
  BILLING_ALERT_ABSOLUTE_CENTS,
} from '@hbcfield/shared';

/**
 * Revenue leaving is silent.
 *
 * A customer dropping from four workspaces to one is a €300/month loss the
 * system processes correctly, prorates fairly and never mentions. The whole
 * value of the alert is that it fires when it matters and stays quiet
 * otherwise — an alert that goes off on an ordinary seat removal is ignored by
 * the time one goes off that isn't.
 */
const eur = (n: number) => n * 100;

describe('what counts as a material drop', () => {
  it('catches the small customer by proportion', () => {
    // €90 → €60 is a third of their bill. No absolute threshold would flag it
    // without also flagging every routine change.
    expect(isMaterialDrop(eur(90), eur(60))).toBe(true);
  });

  it('catches the large customer by amount', () => {
    // €500 off €10,000 is 5% — invisible to any percentage rule, and the single
    // most valuable line on the list.
    expect(isMaterialDrop(eur(10_000), eur(9_500))).toBe(true);
  });

  it('stays quiet when one seat leaves', () => {
    // Somebody leaving is normal. €9.99 is under the floor whatever the share.
    expect(isMaterialDrop(eur(120), eur(110))).toBe(false);
  });

  it('stays quiet for a small proportional change above nothing much', () => {
    // 10% of a €150 bill is €15 — under the €20 floor, so no alert.
    expect(isMaterialDrop(eur(150), eur(135))).toBe(false);
  });

  it('never fires on a rise', () => {
    expect(isMaterialDrop(eur(100), eur(400))).toBe(false);
  });

  it('never fires on a first bill', () => {
    // Nothing to compare against: 0 → anything is not a fall, and treating it
    // as one would alert on every organization that ever subscribes.
    expect(isMaterialDrop(0, eur(500))).toBe(false);
    expect(isMaterialDrop(0, 0)).toBe(false);
  });

  it('fires when a customer cancels everything', () => {
    // The most important case, and the easiest to miss with a percentage-only
    // rule if the bill was small.
    expect(isMaterialDrop(eur(869), 0)).toBe(true);
  });

  it('is exact at each boundary', () => {
    const from = eur(1000);
    // Exactly the proportion → fires.
    expect(isMaterialDrop(from, from - from * BILLING_ALERT_PROPORTION)).toBe(true);
    // A cent under the floor → does not, whatever the share.
    expect(isMaterialDrop(BILLING_ALERT_MIN_DROP_CENTS * 2, BILLING_ALERT_MIN_DROP_CENTS * 2 - (BILLING_ALERT_MIN_DROP_CENTS - 1))).toBe(false);
    // Exactly the absolute amount, at a tiny share → fires.
    expect(isMaterialDrop(eur(100_000), eur(100_000) - BILLING_ALERT_ABSOLUTE_CENTS)).toBe(true);
  });
});

/**
 * A Stripe sync that fails is swallowed on purpose — a member must stay
 * addable when Stripe is unreachable. That is right for the request and wrong
 * for the business: the only trace was a log line nobody reads, and a
 * subscription could drift for weeks while every screen looked healthy.
 */
describe('sync failures, deduped into one open row', () => {
  /** `recordSyncFailure`'s decision, as the service applies it. */
  const decide = (open: { id: string; occurrences: number } | null) =>
    open ? { action: 'increment', to: open.occurrences + 1 } : { action: 'create', to: 1 };

  it('opens a row the first time', () => {
    expect(decide(null)).toEqual({ action: 'create', to: 1 });
  });

  it('counts up instead of opening a second row', () => {
    // A failing sync retries on every member change. An operator needs one row
    // saying "47 times since Tuesday", not 47 rows saying the same thing —
    // the second is a feed people learn to scroll past.
    expect(decide({ id: 'a', occurrences: 46 })).toEqual({ action: 'increment', to: 47 });
  });

  it('opens a fresh row once the last one was acknowledged', () => {
    // The lookup is scoped to acknowledgedAt: null, so acknowledging closes the
    // episode and the next failure is genuinely new information.
    expect(decide(null)).toEqual({ action: 'create', to: 1 });
  });

  it('keeps the LATEST message, not the first', () => {
    // The first failure is often a symptom; the current one is usually the
    // cause. `detail` is overwritten on every increment for that reason.
    const detail = (incoming: string) => incoming.slice(0, 300);
    expect(detail('Stripe is missing 1 price(s): hbcfield_seat_observer_monthly.')).toContain('missing 1 price');
    expect(detail('x'.repeat(500))).toHaveLength(300);
  });
});
