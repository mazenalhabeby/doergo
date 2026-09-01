import {
  routeProblem,
  parseRoute,
  nextPendingStep,
  isCurrentSigner,
  chainProgress,
  signatureStrength,
  MAX_ROUTE_STEPS,
  type SignerStep,
} from '@hbcfield/shared/documents';

/**
 * The signing route: who signs a document, in what order.
 *
 * These are the rules three separate places have to agree on — the service
 * deciding whether somebody may sign, the register saying "waiting on whom",
 * and the certificate saying what each signature is worth. They live in one
 * pure module precisely so they cannot drift, and this suite is what holds
 * them still.
 */
describe('routeProblem', () => {
  it('accepts no route at all — that is every document issued so far', () => {
    expect(routeProblem(null)).toBeNull();
    expect(routeProblem(undefined)).toBeNull();
  });

  it('accepts the time-sheet chain', () => {
    expect(
      routeProblem([{ role: 'MEMBER' }, { role: 'RESPONSIBLE' }, { role: 'CUSTOMER' }]),
    ).toBeNull();
  });

  it('accepts an employment contract — the employer signs too', () => {
    expect(routeProblem([{ role: 'MEMBER' }, { role: 'ORG_REPRESENTATIVE' }])).toBeNull();
  });

  it('refuses an empty route rather than treating it as no route', () => {
    // Distinct states: no route is "one signature as always"; an empty route is
    // a type somebody misconfigured, and silently doing something reasonable
    // would hide that.
    expect(routeProblem([])).toMatch(/at least one step/);
  });

  it('refuses a role it does not know', () => {
    expect(routeProblem([{ role: 'ACCOUNTANT' }])).toMatch(/not a kind of signer/);
  });

  it('refuses the same role twice, and says why it cannot mean two people', () => {
    expect(
      routeProblem([{ role: 'MEMBER' }, { role: 'CUSTOMER' }, { role: 'CUSTOMER' }]),
    ).toMatch(/only ask CUSTOMER to sign once/);
  });

  it('refuses a route long enough to be a workflow', () => {
    const many = Array.from({ length: MAX_ROUTE_STEPS + 1 }, () => ({ role: 'MEMBER' }));
    expect(routeProblem(many)).toMatch(/more than/);
  });

  it('refuses shapes that are not a list of steps', () => {
    for (const bad of ['MEMBER', 42, { role: 'MEMBER' }, [null], ['MEMBER']]) {
      expect(routeProblem(bad)).not.toBeNull();
    }
  });
});

describe('parseRoute', () => {
  it('reads a valid route', () => {
    expect(parseRoute([{ role: 'MEMBER' }, { role: 'CUSTOMER' }])).toEqual([
      { role: 'MEMBER' },
      { role: 'CUSTOMER' },
    ]);
  });

  it('reads anything invalid as no route, so a bad type still issues', () => {
    // The alternative is a type nobody can use until somebody notices.
    expect(parseRoute([{ role: 'NOPE' }])).toBeNull();
    expect(parseRoute('MEMBER')).toBeNull();
  });
});

const step = (over: Partial<SignerStep> & { order: number }): SignerStep => ({
  role: 'MEMBER',
  status: 'PENDING',
  ...over,
});

describe('nextPendingStep', () => {
  it('is the first pending step in ORDER, not in array order', () => {
    const steps = [
      step({ order: 3, role: 'CUSTOMER' }),
      step({ order: 1, status: 'SIGNED' }),
      step({ order: 2, role: 'RESPONSIBLE' }),
    ];
    expect(nextPendingStep(steps)?.order).toBe(2);
  });

  it('passes over a skipped step instead of stranding on it', () => {
    // A route asking for a customer, on a document whose space has none, must
    // still complete — otherwise the chain waits forever on somebody who does
    // not exist.
    const steps = [
      step({ order: 1, status: 'SIGNED' }),
      step({ order: 2, role: 'CUSTOMER', status: 'SKIPPED' }),
      step({ order: 3, role: 'ORG_REPRESENTATIVE' }),
    ];
    expect(nextPendingStep(steps)?.order).toBe(3);
  });

  it('is null once nothing is pending', () => {
    expect(nextPendingStep([step({ order: 1, status: 'SIGNED' })])).toBeNull();
  });
});

describe('isCurrentSigner', () => {
  const steps = [
    step({ order: 1, status: 'SIGNED', userId: 'worker' }),
    step({ order: 2, role: 'RESPONSIBLE', userId: 'anna' }),
    step({ order: 3, role: 'CUSTOMER', userId: 'client' }),
  ];

  it('is true only for whoever is being waited on', () => {
    expect(isCurrentSigner(steps, 'anna')).toBe(true);
  });

  it('is false for a later signer — nobody signs out of turn', () => {
    expect(isCurrentSigner(steps, 'client')).toBe(false);
  });

  it('is false for somebody who has already signed', () => {
    expect(isCurrentSigner(steps, 'worker')).toBe(false);
  });

  it('is false for a stranger', () => {
    expect(isCurrentSigner(steps, 'someone-else')).toBe(false);
  });
});

describe('chainProgress', () => {
  it('counts every step, including skipped ones', () => {
    // "2 of 3" counts the boxes on the page, not the ones that turned out to
    // apply.
    const p = chainProgress([
      step({ order: 1, status: 'SIGNED' }),
      step({ order: 2, status: 'SKIPPED' }),
      step({ order: 3 }),
    ]);
    expect(p.total).toBe(3);
    expect(p.signed).toBe(1);
    expect(p.current?.order).toBe(3);
    expect(p.complete).toBe(false);
  });

  it('is complete when nothing is pending, even with a step skipped', () => {
    const p = chainProgress([
      step({ order: 1, status: 'SIGNED' }),
      step({ order: 2, status: 'SKIPPED' }),
    ]);
    expect(p.complete).toBe(true);
  });

  it('is not complete when there are no steps at all', () => {
    // No steps means no route, which is not the same as a finished one.
    expect(chainProgress([]).complete).toBe(false);
  });
});

describe('signatureStrength', () => {
  it('calls an authenticated signer a session signature', () => {
    expect(signatureStrength({ userId: 'anna' })).toBe('SESSION');
  });

  it('calls an emailed link what it is — proof the link was used', () => {
    expect(signatureStrength({ userId: null, email: 'j.hofer@binderholz.com' })).toBe('LINK');
  });
});
