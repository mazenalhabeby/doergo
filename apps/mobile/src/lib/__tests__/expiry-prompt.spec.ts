import { expiryPrompt, expiryReady, type ExpiryPromptInput } from '@hbcfield/shared/client';

const base: ExpiryPromptInput = {
  hasExpiry: true, hasFile: false, reading: false, source: null, value: null,
};
const at = (over: Partial<ExpiryPromptInput>) => expiryPrompt({ ...base, ...over });

describe('the document is asked before the member is', () => {
  /*
    ⚠️ THE BUG THIS EXISTS FOR. Both surfaces rendered the expiry block as soon
    as a TYPE was chosen — before any file existed — so the first thing on the
    screen was an empty date picker for a date printed on the document the
    member was about to photograph. Pre-filling it afterwards does not help:
    by then they have already typed it.
  */
  it('asks for nothing before there is a document to read', () => {
    expect(at({ hasFile: false })).toEqual({ state: 'WAITING' });
  });

  it('asks for nothing while the document is being read', () => {
    expect(at({ hasFile: true, reading: true })).toEqual({ state: 'READING' });
  });

  it('says nothing at all when the type has no expiry', () => {
    expect(at({ hasExpiry: false, hasFile: true })).toEqual({ state: 'NOT_NEEDED' });
  });
});

describe('a date that was read is stated, not requested', () => {
  it('a zone expiry is a fact, and is marked as one', () => {
    expect(at({ hasFile: true, source: 'MRZ', value: '2030-12-31' }))
      .toEqual({ state: 'FOUND', value: '2030-12-31', certainty: 'PROVEN' });
  });

  it('a date off printed text is offered as a suggestion', () => {
    // An EU driving licence has no zone at all. The latest printed date is a
    // good guess and nothing more, and the member is told which they have.
    expect(at({ hasFile: true, source: 'TEXT', value: '2031-06-01' }))
      .toEqual({ state: 'FOUND', value: '2031-06-01', certainty: 'SUGGESTED' });
  });

  it('the member can always take it back', () => {
    // Confident is not the same as right: a document photographed at an angle
    // produces a confident wrong answer.
    expect(at({ hasFile: true, source: 'MRZ', value: '2030-12-31', overriding: true }))
      .toEqual({ state: 'ASK', value: '2030-12-31', reason: 'CORRECTING' });
  });

  it('an override before a file is still an override', () => {
    expect(at({ overriding: true })).toEqual({ state: 'ASK', value: null, reason: 'CORRECTING' });
  });
});

describe('asking is the last resort, and says why', () => {
  it('asks only once the document has failed to answer', () => {
    expect(at({ hasFile: true, source: 'NOTHING' }))
      .toEqual({ state: 'ASK', value: null, reason: 'UNREADABLE' });
  });

  it('a dropped read still leaves a way to fill the field', () => {
    // Never a required field with no control attached to it.
    expect(at({ hasFile: true, source: null }).state).toBe('ASK');
  });
});

describe('what blocks sending', () => {
  it('a read date is enough — there is nothing left to do', () => {
    expect(expiryReady(at({ hasFile: true, source: 'MRZ', value: '2030-12-31' }))).toBe(true);
  });

  it('a type with no expiry never blocks', () => {
    expect(expiryReady(at({ hasExpiry: false }))).toBe(true);
  });

  it('an unanswered ask blocks, an answered one does not', () => {
    expect(expiryReady(at({ hasFile: true, source: 'NOTHING' }))).toBe(false);
    expect(expiryReady(at({ hasFile: true, source: 'NOTHING', value: '2029-01-01' }))).toBe(true);
  });

  it('a document still being read blocks — but the date is not what is missing', () => {
    expect(expiryReady(at({ hasFile: true, reading: true }))).toBe(false);
  });
});
