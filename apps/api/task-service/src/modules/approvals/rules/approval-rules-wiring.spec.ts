import fs from 'fs';
import path from 'path';

/*
  Office rules are only real if every approve path of their kinds asks the
  gate, and every refusal path drops the open step. A new path that skips it
  lets a rule be bypassed from that page — this fails first.
*/
const MODULES = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(MODULES, rel), 'utf8');

describe('office rules are asked on every approve path of their kinds', () => {
  // A kind whose approve and refuse paths live in two files since a split names both (`a + b`).
  const paths: Array<[string, string]> = [
    [
      'attendance/extra-time/extra-time-approval.service.ts + attendance/extra-time/extra-time-decision.service.ts',
      'overtime',
    ],
    ['attendance/extra-time/outside-shift.service.ts', 'overtime'],
    ['technicians/time-off-decision.service.ts', 'request'],
    ['assets/expenses/asset-expense-review.service.ts', 'expense'],
  ];
  for (const [file, kind] of paths) {
    it(`${file} gates and clears '${kind}'`, () => {
      const src = file.split(' + ').map(read).join('\n');
      expect(src).toMatch(new RegExp(`rules\\.gate\\(\\{[\\s\\S]{0,200}kind: '${kind}'`));
      expect(src).toMatch(new RegExp(`rules\\??\\.clear\\([^)]*'${kind}'`));
      // A step-1 answer returns BEFORE anything is written.
      expect(src).toMatch(/if \(!verdict\.finalize\)[\s\S]{0,80}return success\(/);
    });
  }
});

describe('the newer kinds ask through firstStep, before they write', () => {
  // [file, kind, does the path have a refusal that must drop the open step?]
  const paths: Array<[string, string, boolean]> = [
    ['attendance/entries/approval.service.ts', 'hours', true],
    ['attendance/no-shows/no-show-record.service.ts', 'noShow', true],
    ['assets/proposals/proposal-review.service.ts', 'assetProposal', true],
    // A client request has no refusal — it only ever becomes a job.
    ['tasks/records/task-triage.service.ts', 'clientRequest', false],
  ];
  for (const [file, kind, clears] of paths) {
    it(`${file} asks firstStep for '${kind}' and answers step 1 before writing`, () => {
      const src = read(file);
      // firstStep, or gate itself where the path must open the step again when its write fails.
      expect(src).toMatch(new RegExp(`(firstStep|gate)\\(\\{[\\s\\S]{0,200}kind: '${kind}'`));
      expect(src).toMatch(/if \(step\) return success\(|stage: 'FIRST_STEP'/);
      if (clears) expect(src).toMatch(new RegExp(`rules\\.clear\\([^)]*'${kind}'`));
    });
  }
});

describe('a client request cannot be routed round an "urgent only" rule', () => {
  it('reads urgency from what the CLIENT asked as well as the priority chosen while routing it', () => {
    expect(read('tasks/records/task-triage.service.ts')).toMatch(
      /urgent: isUrgentPriority\(task\.priority\) \|\| isUrgentPriority\(data\.priority\)/,
    );
  });
});
