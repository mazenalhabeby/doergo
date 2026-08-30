import {
  requirementsFor,
  requirementStatuses,
  outstanding,
  waitingOnMember,
  type RequirableType,
} from '@hbcfield/shared';

/**
 * What a member owes the organization.
 *
 * The compliance board is built from DOCUMENTS, so it can only show what people
 * have already given: the technician who uploaded nothing is invisible on it,
 * and that is exactly the person a dispatcher needs to know about. A
 * requirement is what makes an absence into a record.
 *
 * These rules are answered in four places — the member's screen, the compliance
 * board, the review queue, the reminder sweep — so they live in one function and
 * are asserted once, here.
 */

const TECH = 'role-tech';
const OFFICE = 'role-office';

const type = (over: Partial<RequirableType> = {}): RequirableType => ({
  id: 'licence',
  label: 'Driving licence',
  direction: 'SUPPLIED',
  isActive: true,
  isCredential: true,
  hasExpiry: true,
  requiredFromAll: false,
  requiredFromRoleIds: [],
  requiredForWorkflowIds: [],
  ...over,
});

const NOW = new Date('2026-06-01T12:00:00Z');
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe('requirementsFor', () => {
  it('asks nothing of anybody by default', () => {
    // Every SUPPLIED type that exists today means "we accept this if you send
    // it". Turning that into an expectation on upgrade would put a red flag on
    // every member of every organization overnight.
    expect(requirementsFor({ memberRoleId: TECH }, [type()])).toEqual([]);
  });

  it('asks everybody when the type says so', () => {
    expect(requirementsFor({ memberRoleId: TECH }, [type({ requiredFromAll: true })])).toHaveLength(1);
    expect(requirementsFor({ memberRoleId: null }, [type({ requiredFromAll: true })])).toHaveLength(1);
  });

  it('asks only the named roles otherwise', () => {
    const t = [type({ requiredFromRoleIds: [TECH] })];
    expect(requirementsFor({ memberRoleId: TECH }, t)).toHaveLength(1);
    expect(requirementsFor({ memberRoleId: OFFICE }, t)).toHaveLength(0);
    expect(requirementsFor({ memberRoleId: null }, t)).toHaveLength(0);
  });

  it('never requires something the company issues', () => {
    /*
      Requiring a payslip FROM an employee asks them to produce a document only
      the company can make. The admin screen does not offer it either, but the
      rule belongs here, where every surface reads it.
    */
    expect(
      requirementsFor({ memberRoleId: TECH }, [type({ direction: 'ISSUED', requiredFromAll: true })]),
    ).toEqual([]);
  });

  it('drops a retired type, so retiring one stops the chasing', () => {
    expect(
      requirementsFor({ memberRoleId: TECH }, [type({ isActive: false, requiredFromAll: true })]),
    ).toEqual([]);
  });
});

describe('requirementStatuses', () => {
  const REQUIRED = [type({ requiredFromAll: true })];
  const status = (held: any[], types = REQUIRED) =>
    requirementStatuses({ memberRoleId: TECH }, types, held, NOW)[0]!;

  it('is MISSING when nothing was ever sent', () => {
    expect(status([]).state).toBe('MISSING');
  });

  it('is AWAITING_REVIEW while it sits in the queue — not MISSING', () => {
    /*
      The two are different situations for the person: one is waiting on the
      office, the other is waiting on them. Collapsing both into "missing" tells
      somebody to upload a licence they uploaded yesterday, which is how a
      product teaches people to ignore it.
    */
    expect(
      status([{ typeId: 'licence', status: 'PENDING_VERIFICATION', expiresOn: future(365) }]).state,
    ).toBe('AWAITING_REVIEW');
  });

  it('is REJECTED when the last one was refused', () => {
    expect(status([{ typeId: 'licence', status: 'REJECTED', expiresOn: null }]).state).toBe('REJECTED');
  });

  it('is MET once accepted and in date', () => {
    expect(
      status([{ typeId: 'licence', status: 'ISSUED', expiresOn: future(400) }]).state,
    ).toBe('MET');
  });

  it('counts a SIGNED document as accepted too', () => {
    expect(status([{ typeId: 'licence', status: 'SIGNED', expiresOn: future(400) }]).state).toBe('MET');
  });

  it('is MET for an accepted document with no expiry at all', () => {
    // A qualification that does not lapse is legitimate and must not read as
    // expired for want of a date.
    expect(status([{ typeId: 'licence', status: 'ISSUED', expiresOn: null }]).state).toBe('MET');
  });

  it('never reads MET for anything the dispatch gate would refuse', () => {
    /*
      The invariant tying this to the gate: the gate accepts ISSUED and SIGNED
      and nothing else, so neither does this. A requirement showing a green tick
      for a document that cannot be assigned against would be worse than no
      requirement at all.
    */
    for (const s of ['PENDING_VERIFICATION', 'REJECTED', 'DRAFT', 'REVOKED', 'SUPERSEDED']) {
      expect(status([{ typeId: 'licence', status: s, expiresOn: future(400) }]).state).not.toBe('MET');
    }
  });

  it('reads EXPIRING before the date, and EXPIRED after it', () => {
    expect(status([{ typeId: 'licence', status: 'ISSUED', expiresOn: future(10) }]).state).toBe('EXPIRING');
    expect(status([{ typeId: 'licence', status: 'ISSUED', expiresOn: future(-1) }]).state).toBe('EXPIRED');
  });

  it('takes the LATEST expiry when a renewal sits beside an old copy', () => {
    // Sorted the other way round this says "expired" to somebody who renewed
    // last week and left the old one on file.
    const s = status([
      { typeId: 'licence', status: 'ISSUED', expiresOn: future(-30) },
      { typeId: 'licence', status: 'ISSUED', expiresOn: future(400) },
    ]);
    expect(s.state).toBe('MET');
  });

  it('prefers an accepted document over a pending one', () => {
    // Somebody who has a valid licence and has just sent a renewal is MET, not
    // waiting: they can work today.
    const s = status([
      { typeId: 'licence', status: 'ISSUED', expiresOn: future(400) },
      { typeId: 'licence', status: 'PENDING_VERIFICATION', expiresOn: future(1000) },
    ]);
    expect(s.state).toBe('MET');
  });

  it('ignores documents of another type entirely', () => {
    expect(status([{ typeId: 'passport', status: 'ISSUED', expiresOn: future(400) }]).state).toBe('MISSING');
  });

  it('says it blocks work only when the type gates a task type', () => {
    const gating = [type({ requiredFromAll: true, requiredForWorkflowIds: ['w1'] })];
    expect(requirementStatuses({ memberRoleId: TECH }, gating, [], NOW)[0]!.blocksWork).toBe(true);
    expect(status([]).blocksWork).toBe(false);
  });

  it('stops blocking once it is met', () => {
    const gating = [type({ requiredFromAll: true, requiredForWorkflowIds: ['w1'] })];
    const s = requirementStatuses(
      { memberRoleId: TECH },
      gating,
      [{ typeId: 'licence', status: 'ISSUED', expiresOn: future(400) }],
      NOW,
    )[0]!;
    expect(s.blocksWork).toBe(false);
  });

  it('reads an ISO string as readily as a Date', () => {
    // The API hands these back as JSON; the browser never sees a Date.
    expect(
      status([{ typeId: 'licence', status: 'ISSUED', expiresOn: future(400).toISOString() }]).state,
    ).toBe('MET');
  });
});

describe('what still needs doing', () => {
  const types = [
    type({ id: 'licence', label: 'Driving licence', requiredFromAll: true }),
    type({ id: 'id', label: 'ID document', requiredFromAll: true }),
  ];

  it('leaves out what is already met', () => {
    const statuses = requirementStatuses({ memberRoleId: TECH }, types, [
      { typeId: 'licence', status: 'ISSUED', expiresOn: future(400) },
    ], NOW);
    expect(outstanding(statuses).map((s) => s.typeId)).toEqual(['id']);
  });

  it('leaves out one that is merely expiring — that is a reminder, not a task', () => {
    const statuses = requirementStatuses({ memberRoleId: TECH }, types, [
      { typeId: 'licence', status: 'ISSUED', expiresOn: future(10) },
      { typeId: 'id', status: 'ISSUED', expiresOn: null },
    ], NOW);
    expect(outstanding(statuses)).toEqual([]);
  });

  it('knows whose turn it is', () => {
    /*
      The distinction the member's screen lives on. "Send us your licence" under
      a licence they sent yesterday is the fastest way to teach somebody that
      this screen is wrong and can be ignored.
    */
    const statuses = requirementStatuses({ memberRoleId: TECH }, types, [
      { typeId: 'licence', status: 'PENDING_VERIFICATION', expiresOn: future(400) },
    ], NOW);
    const byType = Object.fromEntries(statuses.map((s) => [s.typeId, waitingOnMember(s)]));
    expect(byType).toEqual({ licence: false, id: true });
  });
});
