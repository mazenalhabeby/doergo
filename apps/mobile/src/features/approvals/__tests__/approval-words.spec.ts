import fs from 'fs';
import path from 'path';
import { agreedLineKey, approvalTags, stepNoticeKind } from '@hbcfield/shared/client';

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

const step = { firstById: 'u1', firstByName: 'Anna', roleName: 'Manager', mine: false };
const stepKinds = new Set([
  stepNoticeKind({ ...step, mine: true }),
  stepNoticeKind({ ...step, youFinish: true, waitsForYou: true }),
  stepNoticeKind({ ...step, waitsForYou: true }),
  stepNoticeKind(step),
]);
const agreedKeys = [
  agreedLineKey({ minutes: 30, who: 'Anna', smallerCounts: false }),
  agreedLineKey({ minutes: 30, who: 'Anna', smallerCounts: true }),
  agreedLineKey({ minutes: 30, who: null, smallerCounts: false }),
  agreedLineKey({ minutes: 30, who: null, smallerCounts: true }),
];
const tags = approvalTags({ data: { datesPassed: true }, step: { ...step, waitsForYou: true } });

/** Key → the placeholders it must carry. */
const KEYS: Record<string, string[]> = {
  ...Object.fromEntries([...stepKinds].map((k) => [`approvals.step.${k}`, k === 'youApproved' ? ['role'] : ['name']])),
  'approvals.step.youCanGive': ['name', 'role'],
  'approvals.step.waiting': ['name', 'role'],
  // The agreed line: one whole sentence per case (shared `agreedLineKey`).
  ...Object.fromEntries(
    agreedKeys.map((k) => [`approvals.step.${k}`, k.startsWith('agreedBy') ? ['name', 'time'] : ['time']]),
  ),
  'approvals.step.anAdministrator': [],
  // The plural of the step sentence (several approvers).
  'approvals.step.youFinish_other': ['name'],
  'approvals.step.youCanGive_other': ['name', 'role'],
  'approvals.step.waiting_other': ['name', 'role'],
  // "Who else can decide" on a half-way item.
  'approvals.route.titleMissing': ['role'],
  'approvals.route.nobodyHolds': ['role'],
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
    expect(agreedKeys).toEqual(['agreedBy', 'agreedByCounts', 'agreedSoFar', 'agreedSoFarCounts']);
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
      // The agreed line was two strings glued; it is four whole sentences now.
      expect(at(json, 'approvals.step.agreed')).toBeUndefined();
      expect(at(json, 'approvals.step.smallerCounts')).toBeUndefined();
    });
  }
});
