import * as fs from 'fs';
import * as path from 'path';
import { readSource } from '../../test-utils/read-source';

/**
 * The Jobs tab and New job — the rules a typecheck cannot see.
 *
 *  - Every popup is the ONE sheet (`JobSheet`): no raw `<Modal>`, and none of
 *    the old popups that bring their own (`TechnicianPicker`,
 *    `DatePickerModal`, `TimePickerModal`, the sort menu).
 *  - A status leaves the phone only through the job route's write, handed down.
 *  - The tour still finds its targets, and the tablet its pane.
 */
const MOBILE = path.resolve(__dirname, '../../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (rel: string) => strip(readSource(path.join(MOBILE, rel), 'utf8'));
const dir = (rel: string) => fs.readdirSync(path.join(MOBILE, rel)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${rel}/${f}`);

const TASKS = 'app/(app)/(tabs)/tasks.tsx';
const CREATE = 'app/(app)/(tabs)/create-task.tsx';
const FILES = [TASKS, CREATE, ...dir('src/features/jobs-list'), ...dir('src/features/new-job')];
const all = FILES.map(read).join('\n');

describe('every popup is the one sheet', () => {
  it('finds the files', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(12);
  });

  it('no raw <Modal> anywhere in the Jobs tab or New job', () => {
    expect(FILES.filter((f) => /<Modal\b/.test(read(f)))).toEqual([]);
  });

  it('never opens the old popups that bring their own Modal', () => {
    const banned = /\b(TechnicianPicker|DatePickerModal|TimePickerModal|ConfirmSheet)\b/;
    expect(FILES.filter((f) => banned.test(read(f)))).toEqual([]);
  });

  it('no BlurSheet of its own — only JobSheet, which is BlurSheet + SheetPanel', () => {
    expect(FILES.filter((f) => /<BlurSheet\b/.test(read(f)))).toEqual([]);
    expect(read('src/features/new-job/when-sheets.tsx').match(/<JobSheet\b/g)?.length).toBe(2);
  });

  it('New job holds ONE sheet state for the day, the hour and the person', () => {
    const screen = read('src/features/new-job/new-job-screen.tsx');
    expect(screen.match(/useState<Sheet \| null>/g)?.length).toBe(1);
    for (const k of ['day', 'time', 'assign']) expect(screen).toContain(`visible={sheet === '${k}'}`);
  });

  it('who does it is the reusable AssignSheet, offered only with canAssign', () => {
    const screen = read('src/features/new-job/new-job-screen.tsx');
    expect(screen).toMatch(/\{canAssign \? \(\s*<AssignSheet/);
    expect(screen).toMatch(/\{canAssign \? \(\s*<View style=\{field\}>\s*<SectionLabel>\{t\('newJob\.who'\)\}/);
  });
});

describe('the one status write', () => {
  it('the Jobs tab hands the job route\'s write down — it writes none of its own', () => {
    const route = read(TASKS);
    expect(route).toMatch(/import \{ TaskDetailPane, useWriteStatus \} from '\.\.\/task\/\[id\]'/);
    expect(route).toMatch(/<TaskDetailPane\b/);
    expect(FILES.filter((f) => /changeTaskStatus\(|tasksApi\.updateStatus\(/.test(read(f)))).toEqual([]);
  });

  it('the job route still owns it, through the outbox and the shared fix', () => {
    const screen = read('app/(app)/task/[id].tsx');
    expect(screen).toMatch(/export function useWriteStatus\(\)/);
    expect(screen).toMatch(/takeStatusFix\(newStatus\)/);
  });

  it('a step from the list starts and stops the route recorder by the same rule as the page', () => {
    expect(read('src/features/jobs-list/next-up.tsx')).toMatch(/trackRouteFor\(tracking, task, from, to\)/);
    expect(read('src/features/job/use-job-writes.ts')).toMatch(/trackRouteFor\(tracking, task, from, to\)/);
  });
});

describe('the tour, the tablet, the list', () => {
  it('the tour still finds its four targets', () => {
    // The header anchors its TITLE through ScreenHeader's `tour` prop, not a
    // wrapper — a wrapper rang the status bar too. `tour-registry.spec.ts`
    // checks every step of every tour against the source.
    expect(all).toContain(`tour={{ title: 'tasks-header' }}`);
    for (const name of ['tasks-search', 'tasks-filters', 'tasks-card']) {
      expect(all).toContain(`name="${name}"`);
    }
  });

  it('the list is virtualised and has no sort menu — the bands are the order', () => {
    const screen = read('src/features/jobs-list/jobs-screen.tsx');
    expect(screen).toMatch(/<SectionList\b/);
    expect(all).not.toMatch(/sortBy|SORT_OPTIONS|showSortMenu/);
  });
});

describe('the one header', () => {
  const layout = read('app/(app)/(tabs)/_layout.tsx');

  it('every v2 screen draws the amazen ScreenHeader, not the navigator\'s band', () => {
    for (const f of ['src/features/jobs-list/jobs-screen.tsx', 'src/features/new-job/new-job-screen.tsx', 'src/features/time/time-screen.tsx']) {
      const src = read(f);
      expect(src).toMatch(/import \{[^}]*\bScreenHeader\b[^}]*\} from '(?:\.\.\/amazen|(?:\.\.\/)+components\/amazen|@\/components\/amazen)'/);
      // The avatar is the header's own business — no screen passes it.
      expect(src).not.toMatch(/avatarUrl=|onPressAvatar=/);
    }
    for (const name of ['tasks', 'create-task', 'attendance']) {
      expect(layout).toMatch(new RegExp(`name="${name}"\\s*options=\\{\\{[^}]*headerShown: false`));
    }
  });

  it('the avatar has ONE source and ONE handler — home, the tab bar\'s button, Jobs and New job', () => {
    expect(read('src/components/amazen/screen-header.tsx')).toMatch(/useProfileAvatar\(\)/);
    expect(layout).toMatch(/const \{ avatarUrl, openProfile \} = useProfileAvatar\(\)/);
    expect(read('src/lib/use-profile-avatar.ts')).toMatch(/router\.push\('\/\(app\)\/\(tabs\)\/profile'/);
  });

  it('New job puts Back in the header\'s leading slot', () => {
    expect(read('src/features/new-job/new-job-screen.tsx')).toMatch(/leading=\{/);
    expect(read('src/components/amazen/screen-header.tsx')).toMatch(/\{leading \?\? null\}/);
  });
});

describe('design-system rules', () => {
  it('no Reanimated entering/exiting/layout props', () => {
    expect(FILES.filter((f) => /\b(entering|exiting|layout)=\{/.test(read(f)))).toEqual([]);
  });

  it('colours come from the theme — no static palette', () => {
    expect(FILES.filter((f) => /\bCOLORS\./.test(read(f)))).toEqual([]);
  });

  it('no style names a font face AND a weight', () => {
    const bad = FILES.filter((f) => [...read(f).matchAll(/\{[^{}]*\}/g)].some((m) => /fontFamily\s*:/.test(m[0]) && /fontWeight\s*:/.test(m[0])));
    expect(bad).toEqual([]);
  });

  it('never says paid or unpaid', () => {
    expect(FILES.filter((f) => /\b(un)?paid\b/i.test(read(f)))).toEqual([]);
  });

  it('every new word exists in all five languages', () => {
    const load = (l: string) => JSON.parse(readSource(path.join(MOBILE, 'src/i18n/locales', `${l}.json`), 'utf8'));
    const keys = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
    const en = load('en');
    const want = [...keys(en.jobsList, 'jobsList.'), ...keys(en.newJob, 'newJob.')].sort();
    for (const l of ['de', 'es', 'fr', 'it']) {
      const other = load(l);
      expect([...keys(other.jobsList, 'jobsList.'), ...keys(other.newJob, 'newJob.')].sort()).toEqual(want);
    }
  });
});
