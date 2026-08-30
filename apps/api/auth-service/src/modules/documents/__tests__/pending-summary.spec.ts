import { summarisePending } from '@hbcfield/shared';

/**
 * One reminder, several kinds of outstanding thing.
 *
 * The reason this is tested at all: the first version of the reminder counted
 * only the documents a member had to UPLOAD, and said so in a sentence that
 * read as a complete statement of what was left. Somebody with a contract
 * waiting to be signed was told they had nothing to do.
 */

const upload = (label: string, blocksWork = false) => ({ label, blocksWork });
const sign = (title: string) => ({ title });

describe('summarisePending', () => {
  it('says nothing when nothing is outstanding', () => {
    expect(summarisePending({ toUpload: [], toSign: [], expiring: [] }).empty).toBe(true);
  });

  it('counts BOTH kinds, not just the one it started with', () => {
    const r = summarisePending({
      toUpload: [upload('Passport'), upload('ID document')],
      toSign: [sign('Employment contract')],
      expiring: [],
    });
    expect(r.count).toBe(3);
    expect(r.titleKey).toBe('needYou');
    expect(r.mixed).toBe(true);
  });

  it('breaks the count down instead of naming things when both kinds are present', () => {
    /*
      Six names in a two-line space tells somebody nothing. "2 to upload · 1 to
      sign" tells them what they are in for, which is the question a reminder is
      answering.
    */
    const r = summarisePending({
      toUpload: [upload('Passport'), upload('ID document')],
      toSign: [sign('Employment contract')],
      expiring: [],
    });
    expect(r.names).toEqual([]);
    expect(r.uploadCount).toBe(2);
    expect(r.signCount).toBe(1);
  });

  it('names them when there is only one kind', () => {
    const uploads = summarisePending({
      toUpload: [upload('Passport'), upload('ID document')],
      toSign: [],
      expiring: [],
    });
    expect(uploads.titleKey).toBe('needed');
    expect(uploads.names).toEqual(['Passport', 'ID document']);

    const sigs = summarisePending({ toUpload: [], toSign: [sign('Employment contract')], expiring: [] });
    expect(sigs.titleKey).toBe('toSign');
    expect(sigs.count).toBe(1);
    expect(sigs.names).toEqual(['Employment contract']);
  });

  it('never lets an expiry take the headline from something already wrong', () => {
    /*
      A certificate running out in three weeks, next to a document that is
      missing today, competes for the one line that should be about the thing
      that is already a problem.
    */
    const r = summarisePending({
      toUpload: [upload('Passport')],
      toSign: [],
      expiring: [{ label: 'First aid' }, { label: 'Trade certificate' }],
    });
    expect(r.titleKey).toBe('needed');
    expect(r.count).toBe(1);
    expect(r.expiringCount).toBe(2);
  });

  it('does not count an expiry as something waiting on the member', () => {
    /*
      `actionCount` is what a permanent badge carries. A certificate that runs
      out in three weeks is not something anybody is late for, and a badge
      lighting up for it teaches people to ignore the badge.
    */
    const r = summarisePending({ toUpload: [], toSign: [], expiring: [{ label: 'First aid' }] });
    expect(r.actionCount).toBe(0);
    expect(r.count).toBe(1);
  });

  it('is about expiry only when nothing is actually outstanding', () => {
    const r = summarisePending({ toUpload: [], toSign: [], expiring: [{ label: 'First aid' }] });
    expect(r.empty).toBe(false);
    expect(r.titleKey).toBe('expiring');
    expect(r.names).toEqual(['First aid']);
  });

  it('reports a blockage from any of the uploads, not only the first', () => {
    const r = summarisePending({
      toUpload: [upload('Passport'), upload('Gas certificate', true)],
      toSign: [],
      expiring: [],
    });
    expect(r.blocksWork).toBe(true);
  });

  it('does not claim a blockage for a signature', () => {
    // Only a SUPPLIED requirement carries `blocksWork` — a contract waiting to
    // be signed is not the dispatch gate, and saying it is would be a lie the
    // member cannot act on.
    expect(summarisePending({ toUpload: [], toSign: [sign('Contract')], expiring: [] }).blocksWork).toBe(false);
  });
});
