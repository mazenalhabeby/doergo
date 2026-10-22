import * as fs from 'fs';
import * as path from 'path';
import { readSource } from '@/test-utils/read-source';

/**
 * Step forms — the wiring a typecheck cannot see.
 *
 *  - The job page and Next up decide with ONE rule (`moveKind`) and the page
 *    draws ONE sheet for any form — the old hard-coded Finish sheet and its
 *    `POST /complete` path are gone.
 *  - Files first, then the move, through the ONE status write.
 *  - The sheet is the one sheet (JobSheet), never a raw Modal, and never a
 *    second sheet opened from inside it.
 *  - Reports are read only when their section is seen.
 */

const MOBILE = path.resolve(__dirname, '../../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
// A split file reads with the parts moved out of it (test-utils/read-source.ts).
const read = (rel: string) => strip(readSource(path.join(MOBILE, rel), 'utf8'));

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') yield* walk(full);
    } else if (/\.tsx?$/.test(e.name)) yield full;
  }
}

const page = read('src/features/job/job-page.tsx');
const writes = read('src/features/job/use-job-writes.ts');
const nextUp = read('src/features/jobs-list/next-up.tsx');
const sheet = read('src/features/job/sheets/step-form-sheet.tsx');
const data = read('src/features/job/use-job.ts');

describe('a step with a form opens the sheet; without one the job just moves', () => {
  it('the job page decides with moveKind over formForMove', () => {
    const go = page.slice(page.indexOf('const go = (to: string)'), page.indexOf('const pick = '));
    expect(go).toMatch(/moveKind\(to, formForMove\(task\.workflow, steps, to, workflowName\)\)/);
    expect(go).toMatch(/kind === 'issue'\) \{ setSheet\('issue'\)/);
    expect(go).toMatch(/kind === 'form'\) \{[\s\S]*?setFormTo\(to\);[\s\S]*?setSheet\('form'\)/);
    expect(go).toMatch(/writes\.changeStatus\(to\)/);
    // ⋯ → Report an issue goes through the same rule, so a Blocked form is respected.
    expect(page).toMatch(/case 'issue': go\(TaskStatus\.BLOCKED\)/);
  });

  it('Next up decides with the same rule and hands a form to the page as form:<STEP>', () => {
    expect(nextUp).toMatch(/moveKind\(to, steps \? formForMove\(workflow, steps, to, workflowName\)/);
    expect(nextUp).toMatch(/kind === 'form'\) \{ onOpen\(formSheet\(to\)\)/);
    expect(nextUp).toMatch(/case 'issue': go\('BLOCKED'\)/);
    expect(nextUp).not.toMatch(/needsReport/);
  });

  it('the page draws the step form from whatever form the target step resolves to', () => {
    expect(page).toMatch(
      /const activeForm = formTarget \? formForMove\(task\.workflow, steps, formTarget, workflowName\)\.form : null/,
    );
    expect(page).toMatch(/<StepFormSheet\b/);
    expect(page).toMatch(/writes\.moveWithForm\(formTarget, activeForm, draft, signatures\)/);
    // A refusal keeps the sheet open on its fields.
    expect(page).toMatch(/if \(!res\.ok\) setFormErrors\(res\.fieldErrors \?\? null\)/);
  });
});

describe('the old Finish path is gone', () => {
  it('no FinishSheet, no completeTaskWithReport, no POST /complete from the phone', () => {
    const all = [...walk(path.join(MOBILE, 'src')), ...walk(path.join(MOBILE, 'app'))].map(
      (f) => [path.relative(MOBILE, f), strip(fs.readFileSync(f, 'utf8'))] as const,
    );
    expect(
      all
        .filter(([, s]) => /FinishSheet|completeTaskWithReport|reportsApi\.completeTask|reportAttachmentsApi/.test(s))
        .map(([f]) => f),
    ).toEqual([]);
    expect(fs.existsSync(path.join(MOBILE, 'src/features/job/sheets/finish-sheet.tsx'))).toBe(false);
  });
});

describe('files first, then the move — through the one status write', () => {
  const move = writes.slice(
    writes.indexOf('const moveWithForm = useCallback('),
    writes.indexOf('const resetFormFiles'),
  );

  it('prepares (uploads) before it writes the status, and the write carries the answers and what to wait for', () => {
    const prep = move.indexOf('await prepareStepForm(');
    const write = move.indexOf('await writeStatus(task, to, reason, { answers');
    expect(prep).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(prep);
    expect(move).toMatch(/dependsOn\.length \? \{ dependsOn \} : \{\}/);
    expect(move).not.toMatch(/changeTaskStatus\(|tasksApi\.updateStatus\(/);
  });

  it('every file goes through the ONE sender: queued with a signature kind for the pad, direct only without the engine', () => {
    const send = writes.slice(writes.indexOf('const sendFile = useCallback('), writes.indexOf('const photoRefused'));
    // One road through `write.run`: queued where there is an engine, `uploadDirect` only without one.
    expect(send).toMatch(/write\.run\(\s*\(engine\) =>[\s\S]*?addTaskPhoto\(engine, files!/);
    expect(send).toMatch(/\(\) => uploadDirect\(taskId, photo\)/);
    expect(send).toMatch(/photo\.uri\.startsWith\('data:'\)\s*\?\s*\{ base64: photo\.uri, kind: 'signature' as const \}/);
    expect(send).toMatch(/waitFor: sent\.value\.state === 'done' \? null : sent\.value\.opId/);
    expect(writes.match(/addTaskPhoto\(/g)?.length).toBe(1);
  });

  it('the screen passes the answers on both roads', () => {
    const screen = read('app/(app)/task/[id].tsx');
    expect(screen).toMatch(/answers: extras\?\.answers,\s*dependsOn: extras\?\.dependsOn/);
    expect(screen).toMatch(/tasksApi\.updateStatus\(task\.id, newStatus, reason, location, extras\?\.answers\)/);
  });
});

describe('the sheet — the one sheet, drawn from the form', () => {
  it('is a JobSheet, with no raw Modal and no sheet opened from inside it', () => {
    expect(sheet).toMatch(/<JobSheet\b/);
    expect(sheet).not.toMatch(/<Modal\b/);
    expect(sheet).not.toMatch(/<(DaySheet|TimeSheet|DatePickerModal|TimePickerModal|SignatureCapture)\b/);
    expect(sheet).toMatch(/<SignPad\b/);
  });

  it('draws every field type', () => {
    for (const type of ['note', 'name', 'number', 'choice', 'yesno', 'date', 'photos', 'signature']) {
      expect(sheet).toContain(`case '${type}':`);
    }
    expect(sheet).toMatch(/keyboardType="decimal-pad"/);
  });

  it('opens Next/Send only when the shared rule passes, and keeps every page mounted', () => {
    expect(sheet).toMatch(/pageComplete\(form, draft,/);
    expect(sheet).toMatch(/disabled=\{!canGo/);
    expect(sheet).toMatch(/display: page === i \? 'flex' : 'none'/);
  });

  it("shows the organization's labels through fieldLabel — never a translation key made from them", () => {
    expect(sheet).toMatch(/fieldLabel\(f, t\)/);
    expect(sheet).not.toMatch(/t\(`[^`]*\$\{f\.label\}/);
  });
});

describe('reports — read only when seen', () => {
  it('one read, inside the loader the page calls when the section is on screen', () => {
    expect(data.match(/getSubmissions\(/g)?.length).toBe(1);
    expect(data).toMatch(/const loadSubmissions = useCallback\(\(\) => \{[^}]*\n[^]*?getSubmissions\(/);
    expect(page).toMatch(/job\.loadSubmissions\(\)/);
    expect(page).toMatch(
      /asksRef\.current && submissionsY\.current != null && seenTo\.current >= submissionsY\.current/,
    );
  });

  it("an older job's service report still shows, beside the new reports", () => {
    expect(page).toMatch(/<JobSubmissions\b/);
    expect(page).toMatch(/<JobReport report=\{job\.report\} sayNone=\{reportSaysNone\}/);
  });
});
