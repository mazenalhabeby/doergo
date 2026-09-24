/**
 * A rejected document is not a missing one.
 *
 * ⚠️ THE BUG THIS PINS: `waitingOnMember()` answers true for MISSING, REJECTED
 * and EXPIRED alike, so the server's `/documents/pending` puts all three in
 * `toUpload`. A member whose driving licence came back was told *"1 document
 * needed"* — the same sentence somebody who never sent one gets — and
 * photographed the same cut-off card again. The `reviewNote` saying why exists
 * on the record and nothing on the phone showed it.
 *
 * The rule lives in `packages/shared` and is read by the web too, *"so the two
 * can never quote different numbers for the same person."* It is tested from
 * here because that is where jest runs, and through the app's own import path,
 * so the built `dist` is what gets exercised.
 */
import { summarisePending } from '@hbcfield/shared/client';

const licence = { label: 'Driving licence' };

describe('sent back ranks above everything', () => {
  it('outranks a missing document', () => {
    const p = summarisePending({
      toUpload: [{ label: 'First aid' }],
      toSign: [],
      expiring: [],
      rejected: [licence],
    });
    expect(p.titleKey).toBe('sentBack');
    expect(p.names).toEqual(['Driving licence']);
  });

  it('outranks both kinds at once — the member believes they are done', () => {
    const p = summarisePending({
      toUpload: [{ label: 'First aid' }],
      toSign: [{ title: 'Contract' }],
      expiring: [{ label: 'Forklift' }],
      rejected: [licence],
    });
    expect(p.titleKey).toBe('sentBack');
  });

  it('is not empty when a refusal is the only thing outstanding', () => {
    const p = summarisePending({ toUpload: [], toSign: [], expiring: [], rejected: [licence] });
    expect(p.empty).toBe(false);
    expect(p.count).toBe(1);
    expect(p.sentBackCount).toBe(1);
  });

  it('counts toward what is waiting on the member', () => {
    const p = summarisePending({ toUpload: [], toSign: [], expiring: [], rejected: [licence] });
    expect(p.actionCount).toBe(1);
  });

  it('gates work when the refused requirement does', () => {
    const p = summarisePending({
      toUpload: [], toSign: [], expiring: [],
      rejected: [{ label: 'Driving licence', blocksWork: true }],
    });
    expect(p.blocksWork).toBe(true);
  });

  it("carries the reviewer's words when they reached the phone", () => {
    const note = 'The photo is cut off at the bottom — we need the whole card.';
    const p = summarisePending({
      toUpload: [], toSign: [], expiring: [],
      rejected: [{ label: 'Driving licence', reviewNote: note }],
    });
    expect(p.sentBack).toEqual({ label: 'Driving licence', reviewNote: note });
  });

  it('never invents one', () => {
    /*
      `rejectionReason` lives on the record and neither endpoint returns it.
      The headline is worth saying without it; a made-up note is not.
    */
    const p = summarisePending({ toUpload: [], toSign: [], expiring: [], rejected: [licence] });
    expect(p.sentBack).toEqual({ label: 'Driving licence', reviewNote: null });
  });

  it('names the first and counts the rest', () => {
    const p = summarisePending({
      toUpload: [], toSign: [], expiring: [],
      rejected: [licence, { label: 'First aid' }],
    });
    expect(p.sentBack?.label).toBe('Driving licence');
    expect(p.sentBackCount).toBe(2);
  });

  it('changes nothing when there is no refusal', () => {
    const before = summarisePending({ toUpload: [{ label: 'First aid' }], toSign: [], expiring: [] });
    const after = summarisePending({ toUpload: [{ label: 'First aid' }], toSign: [], expiring: [], rejected: [] });
    expect(after).toEqual(before);
    expect(after.titleKey).toBe('needed');
  });
});

describe('the eight states are a closed list', () => {
  it('has no ninth', () => {
    /*
      `STATES.md` is the complete set: blocking, to supply, expiring, to sign,
      both kinds, sent back, somebody else's, and nothing outstanding. The
      first five and the last are `titleKey` plus `blocksWork`; the two new
      ones are `sentBack` and `countersign`.
    */
    const keys = new Set<string>();
    keys.add(summarisePending({ toUpload: [{ label: 'a', blocksWork: true }], toSign: [], expiring: [] }).titleKey);
    keys.add(summarisePending({ toUpload: [{ label: 'a' }], toSign: [], expiring: [] }).titleKey);
    keys.add(summarisePending({ toUpload: [], toSign: [], expiring: [{ label: 'a' }] }).titleKey);
    keys.add(summarisePending({ toUpload: [], toSign: [{ title: 'a' }], expiring: [] }).titleKey);
    keys.add(summarisePending({ toUpload: [{ label: 'a' }], toSign: [{ title: 'b' }], expiring: [] }).titleKey);
    keys.add(summarisePending({ toUpload: [], toSign: [], expiring: [], rejected: [licence] }).titleKey);
    expect([...keys].sort()).toEqual(['expiring', 'needYou', 'needed', 'sentBack', 'toSign']);
    expect(summarisePending({ toUpload: [], toSign: [], expiring: [] }).empty).toBe(true);
  });
});
