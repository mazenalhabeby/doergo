import fs from 'fs';
import path from 'path';

/**
 * The card's own rules that live in JSX and hooks, where a render test would
 * need the Expo preset — asserted on the source instead, comments stripped so
 * a warning that QUOTES a mistake never satisfies (or trips) the scan.
 */
const SRC = path.resolve(__dirname, '../..');
const raw = fs.readFileSync(path.join(SRC, 'components/home/my-work-card.tsx'), 'utf8');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(SRC, 'i18n/locales', `${l}.json`), 'utf8'));
const at = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

/** Every `t('key', { … })` the card makes, with whether it passes a count and which variables. */
function calls(): Array<{ key: string; vars: string[] }> {
  const out: Array<{ key: string; vars: string[] }> = [];
  const re = /\bt\('([\w.]+)'(?:,\s*\{([^}]*)\})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const opts = (m[2] ?? '').replace(/defaultValue:\s*(`[^`]*`|'[^']*')/g, '');
    const vars = [...opts.matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)].map((x) => x[1]!).filter((v) => v !== 'defaultValue');
    out.push({ key: m[1]!, vars });
  }
  return out;
}

describe('my-work widget — the card source', () => {
  it('reads jobs only through useHomeTasks — no direct list call, no new endpoint', () => {
    expect(code).toContain('useHomeTasks()');
    expect(code).not.toMatch(/tasksApi\.list\(/);
    expect(code).not.toMatch(/fetchWithAuth|fetch\(/);
  });

  it('the neither-module exit sits below every hook', () => {
    const exit = code.indexOf("if (shape === 'none') return null;");
    expect(exit).toBeGreaterThan(0);
    const after = code.slice(exit, code.indexOf('function ActiveRow'));
    expect(after).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref|FocusEffect|Pitch)\(/);
  });

  it('"today" is not frozen at mount — it follows focus, the foreground and midnight', () => {
    expect(code).not.toMatch(/useMemo\(\(\) => startOfDay\(new Date\(\)\), \[\]\)/);
    expect(code).not.toMatch(/useMemo\(\(\) => weekOf\(new Date\(\)\), \[\]\)/);
    expect(code).toContain('msUntilNextDay()');
    expect(code).toMatch(/AppState\.addEventListener\('change'/);
    expect(code).toMatch(/useFocusEffect\(useCallback\(\(\) => \{\s*syncDay\(\);/);
  });

  it("the reader's own rows are drawn as theirs — never with their own name in front", () => {
    expect(code).not.toMatch(/mine=\{face !== 'executor'\}/);
    expect(code).toMatch(/<PlainRow\s+task=\{task\} done=\{!open\(task\)\} mine clock=\{clock\}/);
  });

  it('row times use the phone-local, label-free clock the days are grouped by', () => {
    expect(code).toContain('formatTime(d, null)');
    expect(code).not.toMatch(/formatTime\(task\.dueDate/);
    expect(code).not.toMatch(/formatClock\b/);
  });

  it('called-off jobs are removed before dots, the list and the counts are computed', () => {
    expect(code).toMatch(/const tasks = useMemo\(\(\) => withoutCanceled\(held, flows\)/);
    expect(code).not.toMatch(/const \{ tasks[,\s}]/);
  });

  it('the step label goes through the translated resolver, not the raw status', () => {
    expect(code).toContain('stepLabelFor(task, flows');
    expect(code).not.toMatch(/task\.status\.replace\(/);
  });

  it('the eyebrow count and the "All N" pill count the same rows', () => {
    expect(code).toMatch(/t\('myWork\.jobs', \{ count: pillCount/);
  });
});

describe('my-work widget — every word in five languages', () => {
  const used = calls();

  it('found the keys (guard for the scan itself)', () => {
    expect(used.length).toBeGreaterThan(25);
    expect(used.map((u) => u.key)).toEqual(expect.arrayContaining(['myWork.openJob', 'myWork.late', 'widgets.myWork', 'myWork.all']));
  });

  it.each(LOCALES)('%s has every key the card asks for (plural keys in _one/_other)', (lang) => {
    const dict = load(lang);
    const missing: string[] = [];
    for (const { key, vars } of used) {
      if (typeof at(dict, key) === 'string') continue;
      if (vars.includes('count') && typeof at(dict, `${key}_one`) === 'string' && typeof at(dict, `${key}_other`) === 'string') continue;
      missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('%s keeps every variable the card interpolates', (lang) => {
    const dict = load(lang);
    const broken: string[] = [];
    for (const { key, vars } of used) {
      const forms = [key, `${key}_other`].map((k) => at(dict, k)).filter((v): v is string => typeof v === 'string');
      for (const v of vars) {
        if (!forms.some((f) => f.includes(`{{${v}}}`))) broken.push(`${key}:${v}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('the late/jobs counts are real plurals everywhere (1 Tag / 2 Tage)', () => {
    for (const lang of LOCALES) {
      const dict = load(lang);
      for (const key of ['myWork.late', 'myWork.jobs']) {
        expect(at(dict, `${key}_one`)).not.toBe(at(dict, `${key}_other`));
      }
    }
  });

  it('German says "überfällig" for late work — the phrase seen on the emulator', () => {
    expect(at(load('de'), 'myWork.late_other')).toBe('{{count}} Tage überfällig');
  });

  it('no visible English literal in JSX text', () => {
    // Text directly between two JSX tags on one line: `<AText>Open the job</AText>`.
    const texts = [...code.matchAll(/>[ \t]*([A-Za-z][A-Za-z ,.'!?·]{2,})[ \t]*<\//g)].map((m) => m[1]!.trim());
    expect(texts).toEqual([]);
  });

  it('the status words the step label falls back to exist in every language', () => {
    for (const lang of LOCALES) {
      const dict = load(lang);
      for (const s of ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']) {
        expect(typeof at(dict, `status.${s}`)).toBe('string');
      }
    }
  });
});
