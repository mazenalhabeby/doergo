import * as fs from 'fs';
import * as path from 'path';

/**
 * The job page's structure — the rules a typecheck cannot see.
 *
 *  - Every popup is the ONE sheet (`BlurSheet` + `SheetPanel`, through
 *    `JobSheet`). The page used four raw `<Modal>`s that skipped the one-slot
 *    queue, which is how a second popup gets refused by UIKit and a button
 *    goes dead with nothing in the log.
 *  - The screen stays the single place a status leaves the phone, through the
 *    shared GPS fix.
 *  - The tour still finds its three targets, and the Jobs tab its pane.
 */

const MOBILE = path.resolve(__dirname, '../../..');
const JOB = path.join(MOBILE, 'src/components/job');
const SCREEN = path.join(MOBILE, 'app/(app)/task/[id].tsx');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(e.name)) yield full;
  }
}
const files = [...walk(JOB), SCREEN];
const read = (f: string) => strip(fs.readFileSync(f, 'utf8'));
const rel = (f: string) => path.relative(MOBILE, f);

describe('the job page — every popup is the one sheet', () => {
  it('finds the job files', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('no raw <Modal> anywhere in the page or its screen', () => {
    expect(files.filter((f) => /<Modal\b/.test(read(f))).map(rel)).toEqual([]);
  });

  it('never opens the old popups that bring their own Modal', () => {
    const banned = /<(ConfirmSheet|TechnicianPicker|SignatureCapture|PhotoGrid)\b/;
    expect(files.filter((f) => banned.test(read(f))).map(rel)).toEqual([]);
  });

  it('the one wrapper is BlurSheet + SheetPanel', () => {
    const ui = read(path.join(JOB, 'job-ui.tsx'));
    expect(ui).toMatch(/<BlurSheet\b/);
    expect(ui).toMatch(/<SheetPanel\b/);
  });

  it('every sheet goes through it', () => {
    const sheets = [...walk(path.join(JOB, 'sheets'))];
    expect(sheets.length).toBeGreaterThanOrEqual(7);
    expect(sheets.filter((f) => !/<JobSheet\b/.test(read(f))).map(rel)).toEqual([]);
  });

  it('the page holds ONE sheet state, so two can never be asked for at once', () => {
    const page = read(path.join(JOB, 'job-page.tsx'));
    expect(page.match(/useState<SheetKind \| null>/g)?.length).toBe(1);
    // Each sheet is visible on its own kind.
    for (const kind of ['more', 'issue', 'decline', 'cancel', 'assign', 'edit', 'sign', 'delete']) {
      expect(page).toContain(`visible={sheet === '${kind}'}`);
    }
    // The step form is visible on its kind AND only while there is a form to draw.
    expect(page).toContain(`visible={sheet === 'form' && !!activeForm}`);
  });

  it('the signature pad is drawn in place, not in a modal of its own', () => {
    const pad = read(path.join(JOB, 'sign-pad.tsx'));
    expect(pad).toMatch(/NativeSignaturePad/);
    expect(pad).not.toMatch(/SignatureCapture/);
  });
});

describe('the job page — the screen', () => {
  const screen = read(SCREEN);

  it('keeps the named pane the Jobs tab imports', () => {
    expect(screen).toMatch(/export function TaskDetailPane\(\{\s*taskId,\s*embedded = false,\s*onClose,/);
    expect(screen).toMatch(/export default function TaskDetailScreen/);
  });

  it('is the one place a status leaves the phone, through the outbox and the shared fix', () => {
    expect(screen).toMatch(/takeStatusFix\(newStatus\)/);
    expect(screen).toMatch(/changeTaskStatus\(offline\.engine/);
    const writers = files.filter((f) => f !== SCREEN && /changeTaskStatus\(|tasksApi\.updateStatus\(/.test(read(f)));
    expect(writers.map(rel)).toEqual([]);
  });

  it('the tour still finds its three targets', () => {
    const all = files.map(read).join('\n');
    for (const name of ['taskdetail-header', 'taskdetail-status', 'taskdetail-actions']) {
      expect(all).toContain(`name="${name}"`);
    }
  });
});

describe('the job page — design-system rules', () => {
  it('no Reanimated entering/exiting/layout props (the cross-platform trap)', () => {
    expect(files.filter((f) => /\b(entering|exiting|layout)=\{/.test(read(f))).map(rel)).toEqual([]);
  });

  it('no style names a font face AND a weight', () => {
    const bad = files.filter((f) => [...read(f).matchAll(/\{[^{}]*\}/g)].some((m) => /fontFamily\s*:/.test(m[0]) && /fontWeight\s*:/.test(m[0])));
    expect(bad.map(rel)).toEqual([]);
  });

  it('colours come from the theme — no static palette on the page', () => {
    expect(files.filter((f) => /\bCOLORS\./.test(read(f))).map(rel)).toEqual([]);
  });

  it('never says paid or unpaid', () => {
    expect(files.filter((f) => /\b(un)?paid\b/i.test(read(f))).map(rel)).toEqual([]);
  });
});

describe('the job page — the server pieces it uses', () => {
  const tasks = strip(fs.readFileSync(path.join(MOBILE, 'src/lib/api/tasks.ts'), 'utf8'));
  const reports = strip(fs.readFileSync(path.join(MOBILE, 'src/lib/api/reports.ts'), 'utf8'));

  it('edits with PUT — the gateway has no PATCH /tasks/:id', () => {
    const update = tasks.slice(tasks.indexOf('update: async'), tasks.indexOf('assign: async'));
    expect(update).toMatch(/method: 'PUT'/);
  });

  it('ticks a checklist item with PATCH /tasks/:id/checklist/:itemId and { isCompleted }', () => {
    const toggle = tasks.slice(tasks.indexOf('toggleChecklistItem'), tasks.indexOf('getTimeline'));
    expect(toggle).toMatch(/\/tasks\/\$\{taskId\}\/checklist\/\$\{itemId\}/);
    expect(toggle).toMatch(/method: 'PATCH'/);
    expect(toggle).toMatch(/JSON\.stringify\(\{ isCompleted \}\)/);
  });

  it('reads a finished report from GET /tasks/:id/report, and "none" is null', () => {
    const get = reports.slice(reports.indexOf('getByTask'));
    expect(get).toMatch(/\/tasks\/\$\{taskId\}\/report/);
    expect(get).toMatch(/typeof r\.summary === 'string'/);
  });

  it('asks for the timeline and the report only when their section is on screen', () => {
    const page = read(path.join(JOB, 'job-page.tsx'));
    const data = read(path.join(JOB, 'use-job.ts'));
    // One call each, and each inside the loader the page calls from `onLayout`/`onScroll`.
    expect(data.match(/getTimeline\(/g)?.length).toBe(1);
    expect(data).toMatch(/const loadEvents = useCallback\(\(\) => \{[^}]*\n[^]*?getTimeline\(/);
    expect(data.match(/getByTask\(/g)?.length).toBe(1);
    expect(data).toMatch(/const loadReport = useCallback\(\(\) => \{[^}]*\n[^]*?getByTask\(/);
    expect(page).toMatch(/job\.loadEvents\(\)/);
    expect(page).toMatch(/job\.loadReport\(\)/);
  });
});
