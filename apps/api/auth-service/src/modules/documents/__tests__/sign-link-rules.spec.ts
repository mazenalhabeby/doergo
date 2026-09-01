import {
  signLinkRefusal,
  canReissue,
  signLinkExpiry,
  acceptedForSigning,
  LINK_REISSUE_COOLDOWN_MS,
  SIGN_LINK_TTL_DAYS,
  isSelfSigning,
} from '@hbcfield/shared';

/**
 * The rules a client's signing link obeys.
 *
 * Pure, and tested here rather than through the service, because three separate
 * places ask them — the endpoint deciding whether to answer, the page deciding
 * what to render, and the certificate deciding what to claim. A disagreement
 * between any two of those is a client either locked out of their own documents
 * or able to sign something that is no longer theirs.
 */
describe('signLinkRefusal', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('accepts a link that has not expired', () => {
    expect(signLinkRefusal({ expiresAt: '2026-09-10T00:00:00Z' }, now)).toBeNull();
  });

  it('refuses a missing link as UNKNOWN, never as expired', () => {
    /*
      The distinction is the whole point. "Expired" earns an offer of a new
      link; "unknown" must say nothing at all. Collapsing them would turn this
      page into a way to find out whether an address is a client here.
    */
    expect(signLinkRefusal(null, now)).toBe('unknown');
    expect(signLinkRefusal(undefined, now)).toBe('unknown');
  });

  it('refuses an expired link as EXPIRED, so a new one can be offered', () => {
    expect(signLinkRefusal({ expiresAt: '2026-08-30T00:00:00Z' }, now)).toBe('expired');
  });

  it('treats the exact expiry instant as expired', () => {
    // A boundary that favours the product over the client is the wrong way
    // round here: an ambiguous second should refuse, not admit.
    expect(signLinkRefusal({ expiresAt: now.toISOString() }, now)).toBe('expired');
  });
});

describe('signLinkExpiry', () => {
  it('is the product’s existing answer to how long a document stays open', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    const days = (signLinkExpiry(now).getTime() - now.getTime()) / 86_400_000;
    expect(days).toBe(SIGN_LINK_TTL_DAYS);
  });
});

describe('canReissue', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('allows the first send', () => {
    expect(canReissue(null, now)).toBe(true);
  });

  it('refuses a second send inside the cooldown', () => {
    /*
      Per-IP throttling stops one machine hammering the form. This stops many
      machines being pointed at one client's inbox — the form is the only part
      of this a stranger can reach, and the only one that costs somebody else
      an email.
    */
    const justNow = new Date(now.getTime() - LINK_REISSUE_COOLDOWN_MS + 1000);
    expect(canReissue(justNow, now)).toBe(false);
  });

  it('allows it once the cooldown has passed', () => {
    const earlier = new Date(now.getTime() - LINK_REISSUE_COOLDOWN_MS - 1000);
    expect(canReissue(earlier, now)).toBe(true);
  });
});

describe('acceptedForSigning', () => {
  const pending = [{ signerId: 'a' }, { signerId: 'b' }, { signerId: 'c' }];

  it('keeps what is genuinely still pending', () => {
    expect(acceptedForSigning(['a', 'c'], pending)).toEqual(['a', 'c']);
  });

  it('drops a document that has left the queue since the page was drawn', () => {
    /*
      The page a client is looking at may be hours old — a document could have
      been sent back or revoked in between. Trusting the request would let
      somebody sign a document that is no longer theirs, on a version their
      supplier has since withdrawn.
    */
    expect(acceptedForSigning(['a', 'gone'], pending)).toEqual(['a']);
  });

  it('ignores ids that were never theirs at all', () => {
    // A crafted request is the same case as a stale one, and needs no special
    // handling — the intersection is the authorization.
    expect(acceptedForSigning(['someone-elses-document'], pending)).toEqual([]);
  });

  it('signs a document once even when asked twice', () => {
    // A duplicated id would otherwise mean two signature rows for one step,
    // which the unique constraint on signerId would reject half-way through a
    // batch — after earlier documents had already been sealed.
    expect(acceptedForSigning(['b', 'b'], pending)).toEqual(['b']);
  });

  it('accepts nothing from an empty queue', () => {
    expect(acceptedForSigning(['a'], [])).toEqual([]);
  });

  it('preserves the order the client asked for', () => {
    expect(acceptedForSigning(['c', 'a'], pending)).toEqual(['c', 'a']);
  });
});

describe('isSelfSigning', () => {
  const member = { id: 'worker', email: 'ahmed@example.com' };

  it('catches the same account holding a later step', () => {
    expect(isSelfSigning(member, { userId: 'worker' })).toBe(true);
  });

  it('catches the same INBOX behind a different record', () => {
    /*
      The ordinary way this happens, and the one an id check misses entirely: a
      CRM client record carrying the member's own address. Two hats, one person,
      and a chain that reads as three signatures while being worth one.
    */
    expect(isSelfSigning(member, { userId: null, email: 'AHMED@example.com' })).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    expect(isSelfSigning(member, { email: '  Ahmed@Example.COM ' })).toBe(true);
  });

  it('allows a genuinely different person', () => {
    expect(isSelfSigning(member, { userId: 'anna', email: 'anna@example.com' })).toBe(false);
  });

  it('does not match two people who merely both lack an address', () => {
    // Absence is not identity. Treating "no email" as a match would block every
    // signer a company has not recorded an address for.
    expect(isSelfSigning({ id: 'worker', email: null }, { userId: 'anna', email: null })).toBe(false);
  });
});
