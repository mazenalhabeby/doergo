/**
 * A person's name, their initials, a calendar day, a duration, money and a
 * file size are said through the SHARED formatters — never built by hand.
 *
 * The phone had six initials functions that disagreed ("·", "?", "" or the
 * literal "UNDEFINED" for a missing surname), thirty `${firstName} ${lastName}`
 * builders (which print "John null"), a dozen "YYYY-MM-DD" builders (one of
 * them a UTC date that asked for the wrong month east of Greenwich), five
 * "2h 0m" duration helpers, a money formatter that built an `Intl.NumberFormat`
 * per call and a byte formatter of its own. They now read, from
 * `@hbcfield/shared/client`:
 *
 *   personName / personInitials   (lib/people.ts adds only the e-mail fallback)
 *   localDateKey / todayKey
 *   formatDuration / formatDurationSeconds
 *   formatMoney / fromCents / toCents
 *   formatFileSize
 *
 * This reads the phone's source (comments stripped) and fails on the SHAPES
 * those copies had. It cannot read intent, so a legitimate exception is
 * ALLOWED BY NAME below with its reason — adding one is a decision somebody
 * can see in review.
 */
import fs from 'fs';
import path from 'path';

const MOBILE = path.join(__dirname, '../../..');
const ROOTS = ['src', 'app'];

/** Legitimate, named: `file` + a fragment of the offending line + why. */
const ALLOWED: { file: string; contains: string; why: string }[] = [];

const RULES: { name: string; re: RegExp; ext?: RegExp }[] = [
  // ── initials ──
  { name: 'initials taken from firstName/lastName by hand', re: /\b(?:firstName|lastName)\b(?:\s*\?\?\s*'')?\)?\??\.?(?:\[0\]|\.charAt\(0\))/ },
  { name: 'initials taken word by word by hand', re: /\.map\(\(?\w+\)?\s*=>\s*\w+(?:\[0\]|\.charAt\(0\))/ },
  // ── a full name ──
  { name: '`${firstName} ${lastName}` built by hand', re: /\$\{[^}]*\bfirstName\b[^}]*\}\s*\$\{[^}]*\blastName\b/ },
  { name: '[firstName, lastName].filter(Boolean).join', re: /\[[^\]]*\bfirstName\b[^\]]*\blastName\b[^\]]*\]\.filter\(Boolean\)\.join\(/ },
  { name: 'JSX: {firstName} {lastName}', re: /\{[^{}]*\bfirstName\}\s+\{[^{}]*\blastName\}/, ext: /\.tsx$/ },
  // ── a calendar day ──
  { name: '"YYYY-MM-DD" built from getFullYear()', re: /\$\{[^}]*getFullYear\(\)\}\s*-/ },
  { name: 'a UTC day taken from toISOString()', re: /toISOString\(\)\.(?:slice|substring)\(0,\s?10\)|toISOString\(\)\.split\(\s*['"]T['"]\s*\)/ },
  { name: 'toISODateString (a UTC day) — use localDateKey', re: /\btoISODateString\(/ },
  { name: 'an en-CA formatter used as a day key', re: /DateTimeFormat\(\s*['"]en-CA['"]/ },
  // ── a duration ──
  { name: '"Xh Ym" built by hand', re: /\$\{[^}]*\}h \$\{[^}]*\}m\b/ },
  { name: 'JSX: {h}h {m}m', re: /\}h \{[^}]*\}m\b/, ext: /\.tsx$/ },
  // ── money and sizes ──
  { name: "a currency Intl.NumberFormat — use formatMoney (cents in, cached)", re: /style:\s*['"]currency['"]/ },
  { name: 'a byte count divided by hand for KB/MB/GB', re: /\/\s*\(?1024\b[^\n]*\b(?:KB|MB|GB)\b/ },
];

function* files(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(spec|test)\.tsx?$/.test(e.name)) yield p;
  }
}

/** Comments may quote the old shapes; only code is judged. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n');
}

function offences(): string[] {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const abs of files(path.join(MOBILE, root))) {
      const rel = path.relative(MOBILE, abs).split(path.sep).join('/');
      const lines = stripComments(fs.readFileSync(abs, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        for (const rule of RULES) {
          if (rule.ext && !rule.ext.test(rel)) continue;
          if (!rule.re.test(line)) continue;
          if (ALLOWED.some((a) => a.file === rel && line.includes(a.contains))) continue;
          found.push(`${rel}:${i + 1} — ${rule.name}: ${line.trim()}`);
        }
      });
    }
  }
  return found;
}

describe('names, days, durations, money and sizes go through the shared formatters', () => {
  it('finds the source it is meant to read', () => {
    const n = ROOTS.reduce((acc, r) => acc + [...files(path.join(MOBILE, r))].length, 0);
    expect(n).toBeGreaterThan(300);
  });

  it('no screen builds one by hand', () => {
    expect(offences()).toEqual([]);
  });

  it('every allowed exception still exists — a stale entry would hide a new one', () => {
    const stale = ALLOWED.filter((a) => {
      const p = path.join(MOBILE, a.file);
      return !fs.existsSync(p) || !fs.readFileSync(p, 'utf8').includes(a.contains);
    });
    expect(stale).toEqual([]);
  });

  it('the rules catch what they are for (planted)', () => {
    const planted: [string, string][] = [
      ['x.ts', "const i = `${(p.firstName ?? '').charAt(0)}${(p.lastName ?? '').charAt(0)}`.toUpperCase();"],
      ['x.ts', "const i = `${person?.firstName?.[0] ?? ''}${person?.lastName?.[0] ?? ''}`;"],
      ['x.ts', "const i = user?.firstName?.[0]?.toUpperCase() || '?';"],
      ['x.tsx', '{item.firstName[0]}{item.lastName[0]}'],
      ['x.ts', "name.split(/\\s+/).map((w) => w[0]).join('')"],
      ['x.ts', 'const n = `${u.firstName} ${u.lastName}`.trim();'],
      ['x.ts', "const n = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();"],
      ['x.ts', "const n = [user?.firstName, user?.lastName].filter(Boolean).join(' ');"],
      ['x.tsx', '{leader.firstName} {leader.lastName}'],
      ['x.ts', "return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;"],
      ['x.ts', 'const day = new Date().toISOString().slice(0, 10);'],
      ['x.ts', "const day = d.toISOString().split('T')[0];"],
      ['x.ts', 'startDate: toISODateString(getStartOfMonth(now))'],
      ['x.ts', "new Intl.DateTimeFormat('en-CA', { year: 'numeric' })"],
      ['x.ts', 'return h > 0 ? `${h}h ${m}m` : `${m}m`;'],
      ['x.tsx', '{Math.floor(left / 60)}h {left % 60}m'],
      ['x.ts', "new Intl.NumberFormat(locale, { style: 'currency', currency })"],
      ['x.ts', 'return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;'],
    ];
    for (const [file, line] of planted) {
      const hit = RULES.some((r) => (!r.ext || r.ext.test(file)) && r.re.test(line));
      expect([line, hit]).toEqual([line, true]);
    }
    // …and leave the shared calls, and a translated "{{h}}h {{m}}", alone.
    const clean = [
      'const n = personName(u);',
      "const i = personInitials(p, '·');",
      'const k = localDateKey(d, timeZone);',
      'return formatDuration(minutes);',
      "return t('crew.hoursMin', { h, m, defaultValue: `${h}h ${m}` });",
      'const STORAGE_URGENT_BYTES = 1024 * 1024 * 1024;',
    ];
    for (const line of clean) expect([line, RULES.some((r) => r.re.test(line))]).toEqual([line, false]);
  });
});
