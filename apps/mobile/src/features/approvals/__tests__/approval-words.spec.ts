import fs from 'fs';
import path from 'path';
import { approvalTags, stepNoticeKind } from '@hbcfield/shared/client';

/*
  The phone's own approvals words — the step sentences (chosen by the shared `stepNoticeKind`), the marks (shared
  `approvalTags`), the agreed-time line and the home strip's approvals row — in all five languages, with the
  placeholders each sentence is given.
*/

const DIR = path.join(__dirname, '..', '..', '..', 'i18n', 'locales');
const LOCALES = ['en', 'de', 'es', 'fr', 'it'];
const read = (l: string) => JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8'));
const at = (o: unknown, key: string) =>
  key.split('.').reduce<unknown>((a, p) => (a as Record<string, unknown> | undefined)?.[p], o);

const step = { firstByName: 'Anna', mine: false };
const stepKinds = new Set([
  stepNoticeKind({ ...step, mine: true }),
  stepNoticeKind({ ...step, youFinish: true, waitsForYou: true }),
  stepNoticeKind({ ...step, waitsForYou: true }),
  stepNoticeKind(step),
]);
const tags = approvalTags({ data: { datesPassed: true }, step: { ...step, waitsForYou: true } });

/** Key → the placeholders it must carry. */
const KEYS: Record<string, string[]> = {
  ...Object.fromEntries([...stepKinds].map((k) => [`approvals.step.${k}`, k === 'youApproved' ? ['role'] : ['name']])),
  'approvals.step.youCanGive': ['name', 'role'],
  'approvals.step.waiting': ['name', 'role'],
  'approvals.step.agreed': ['name', 'time'],
  'approvals.step.agreedSoFar': ['time'],
  'approvals.step.smallerCounts': [],
  ...Object.fromEntries(tags.map((k) => [`approvals.tag.${k}`, []])),
  'strip.line.approvals_one': ['count'],
  'strip.line.approvals_other': ['count'],
  'strip.item.approvals_one': ['count'],
  'strip.item.approvals_other': ['count'],
  'strip.item.approvalsSub': [],
};

describe('the phone’s approvals words, in every language', () => {
  it('covers every sentence and mark the shared rules can choose', () => {
    expect([...stepKinds].sort()).toEqual(['waiting', 'youApproved', 'youCanGive', 'youFinish']);
    expect(tags).toEqual(['waitsForYou', 'datesPassed']);
  });
  for (const l of LOCALES) {
    it(l, () => {
      const json = read(l);
      for (const [key, vars] of Object.entries(KEYS)) {
        const v = at(json, key);
        expect([key, typeof v]).toEqual([key, 'string']);
        for (const name of vars) expect([key, (v as string).includes(`{{${name}}}`)]).toEqual([key, true]);
      }
      // One name for each idea: the old sentence key is gone.
      expect(at(json, 'approvals.step.mine')).toBeUndefined();
      expect(at(json, 'approvals.tag.forYou')).toBeUndefined();
    });
  }
});
