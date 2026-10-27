import fs from 'fs';
import path from 'path';

/*
  Office rules are only real if EVERY approve path of their kinds asks them through `rules.decide` (the write
  runs only when every approval is in, and the step opens again if it fails), and every refusal path drops the
  open step. A new path that writes past the rules lets a rule be bypassed from that page — this fails first.

  ⚠️ Checked ONE FILE AT A TIME: the first version joined two files and grepped the result, so a path in one
  file that never asked passed on the strength of the other ("overtime added to a finished shift").
*/
const MODULES = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(MODULES, rel), 'utf8');
// `firstOfMany` is decide() for a batch of NEW items (days typed in together) — the same judging, at once.
const decides = (kind: string) =>
  new RegExp(`rules\\.(?:decide|firstOfMany)\\(\\s*\\{[\\s\\S]{0,240}kind: '${kind}'`, 'g');
const clears = (kind: string) => new RegExp(`rules\\.clear\\([^)]*'${kind}'`);

// [file, kind, does it also refuse (and must drop the step)?]
const PATHS: Array<[string, string, boolean]> = [
  ['attendance/extra-time/extra-time-approval.service.ts', 'overtime', false],
  // ADD overtime to a closed shift (the hole: it wrote with no rule at all) · refuse a round.
  ['attendance/extra-time/extra-time-decision.service.ts', 'overtime', true],
  ['attendance/extra-time/outside-shift.service.ts', 'overtime', true],
  ['attendance/entries/approval.service.ts', 'hours', true],
  // Typed-in hours are changed hours, their whole length.
  ['attendance/entries/manual-entries.service.ts', 'hours', false],
  ['attendance/no-shows/no-show-record.service.ts', 'noShow', true],
  ['technicians/time-off-decision.service.ts', 'request', true],
  // The office recording leave, or setting a day's hours, follows the same rules as a member asking.
  ['technicians/leave-records.service.ts', 'request', false],
  ['technicians/day-hours.service.ts', 'request', false],
  // New dates on leave already on the record are a new decision; the approvals for the old ones end.
  ['technicians/leave-edits.service.ts', 'request', true],
  ['assets/expenses/asset-expense-review.service.ts', 'expense', true],
  ['assets/proposals/proposal-review.service.ts', 'assetProposal', true],
  // A client request has no refusal — it only ever becomes a job.
  ['tasks/records/task-triage.service.ts', 'clientRequest', false],
];

describe('every approve path asks the office rules through decide()', () => {
  for (const [file, kind, refuses] of PATHS) {
    it(`${file} asks decide() for '${kind}'${refuses ? ' and clears on a refusal' : ''}`, () => {
      const src = read(file);
      expect(src).toMatch(decides(kind));
      // Nothing in an approve path asks the gate directly: decide() is what re-opens a step a failed write used.
      expect(src).not.toMatch(/rules\.gate\(/);
      if (refuses) expect(src).toMatch(clears(kind));
    });
  }

  it('step 1 answers before anything is written, on every path that can wait', () => {
    const silent = PATHS.filter(([f]) => !/decided\.waiting/.test(read(f))).map(([f]) => f);
    // The office's typed-in hours just stay waiting; every other path answers "waiting for …".
    expect(silent).toEqual(['attendance/entries/manual-entries.service.ts']);
  });
});

describe('a client request cannot be routed round an "urgent only" rule', () => {
  it('reads urgency from what the CLIENT asked as well as the priority chosen while routing it', () => {
    expect(read('tasks/records/task-triage.service.ts')).toMatch(
      /urgent: isUrgentPriority\(task\.priority\) \|\| isUrgentPriority\(data\.priority\)/,
    );
  });
});
