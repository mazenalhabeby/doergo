/**
 * A distance is said through the ONE formatter — never built by hand.
 *
 * Before `formatDistance` (packages/shared/src/utils/distance.ts) every surface
 * kept its own: `${away}m`, `(m / 1000).toFixed(1) + 'km'`, a route card `km()`
 * that always said km, a web `formatDistance` and a second one beside it. The
 * server's arrival refusal told a member "You are 9630871m from the job site".
 *
 * This reads the source of the phone, the web and the services and fails on a
 * hand-built distance: a unit glued to an interpolation, a `/ 1000` beside
 * "km", a distance-named value followed by "m". It cannot read intent, so a
 * legitimate non-display use (a log line, a speed) is ALLOWED BY NAME below,
 * each with its reason — adding one is a decision somebody can see in review.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '../../../../..');

const ROOTS = [
  'apps/mobile/src',
  'apps/mobile/app',
  'apps/web-app/src',
  'apps/api/gateway/src',
  'apps/api/task-service/src',
  'apps/api/auth-service/src',
  'apps/api/notification-service/src',
  'apps/api/tracking-service/src',
  'packages/shared/src',
];

/** Where the rules themselves live — the one place allowed to join a number and "km". */
const FORMATTER = 'packages/shared/src/utils/distance.ts';

/** Legitimate, named: `file` + a fragment of the offending line + why. */
const ALLOWED: { file: string; contains: string; why: string }[] = [
  { file: 'apps/api/notification-service/src/handlers/attendance-notification.handler.ts', contains: 'distance=${data.distance}m', why: 'log line for operators, not shown to anybody' },
  { file: 'apps/api/notification-service/src/handlers/attendance-notification.handler.ts', contains: "${data.distanceM ?? '?'}m", why: 'log line for operators, not shown to anybody' },
  { file: 'apps/api/tracking-service/src/modules/location/location.service.ts', contains: 'distance=${Math.round(distance)}m', why: 'log line for operators' },
  { file: 'apps/api/task-service/src/modules/attendance/clock-out.service.ts', contains: 'distance=${data.distance}m, allowed=${data.allowedRadius}m', why: 'log line for operators' },
  { file: 'apps/web-app/src/app/(dashboard)/tasks/[id]/_components/route-tracking-section.tsx', contains: 'const km = distanceMeters / 1000', why: 'average SPEED (km/h), not a distance shown' },
  { file: 'apps/web-app/src/app/(dashboard)/locations/_components/space-form.tsx', contains: '{radius}m', why: 'the readout of the radius INPUT slider — the admin sets metres' },
];

const RULES: { name: string; re: RegExp; ext?: RegExp }[] = [
  // "km/h" is a speed, not a distance.
  { name: 'unit "km" glued to an interpolation', re: /\$\{[^}]*\}\s?km\b(?!\/h)/ },
  { name: 'toFixed then "km"', re: /toFixed\(\d\)\s*\}?\s*`?\s*\+?\s*['"`]?\s?km\b/ },
  { name: '"/ 1000" beside "km"', re: /\/\s?1000\b[^\n]*\bkm\b(?!\/h)|\bkm\b[^\n]*\/\s?1000\b/ },
  {
    name: 'a distance-named value followed by "m"',
    re: /\$\{[^}]*(?:distance|Distance|metres|Metres|meters|Meters|radius|Radius|away|Away)[^}]*\}\s?m(?![\p{L}\d])/u,
  },
  {
    name: 'JSX: a distance-named value followed by "m"/"km"',
    re: /(?<!\$)\{[^{}]*\b(?:distance\w*|\w*[mM]etres|\w*[mM]eters|radius)\b[^{}]*\}\s?(?:m|km)(?![\p{L}\d])/u,
    ext: /\.tsx$/,
  },
];

function* files(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(spec|test)\.tsx?$/.test(e.name)) yield p;
  }
}

/** Comments may talk about "1701 km"; only code is judged. */
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
    for (const abs of files(path.join(REPO, root))) {
      const rel = path.relative(REPO, abs).split(path.sep).join('/');
      if (rel === FORMATTER) continue;
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

/** Locale strings: the unit comes with the formatted value, so it must not be in the sentence. */
function localeOffences(): string[] {
  const dirs = ['apps/mobile/src/i18n/locales', 'apps/web-app/src/i18n/locales'];
  const found: string[] = [];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(REPO, d)).filter((n) => n.endsWith('.json'))) {
      const lines = fs.readFileSync(path.join(REPO, d, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/\{\{(?:distance|radius|span)\}\}\s?-?(?:m|km)(?![\p{L}\d])/u.test(line)) found.push(`${d}/${f}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  return found;
}

describe('distances are said through the one formatter', () => {
  it('finds the source it is meant to read', () => {
    const n = ROOTS.reduce((acc, r) => acc + [...files(path.join(REPO, r))].length, 0);
    expect(n).toBeGreaterThan(500);
  });

  it('no screen or service builds a distance by hand', () => {
    expect(offences()).toEqual([]);
  });

  it('no translated sentence carries its own "m"/"km" after a distance placeholder', () => {
    expect(localeOffences()).toEqual([]);
  });

  it('every allowed exception still exists — a stale entry would hide a new one', () => {
    const stale = ALLOWED.filter((a) => {
      const p = path.join(REPO, a.file);
      return !fs.existsSync(p) || !fs.readFileSync(p, 'utf8').includes(a.contains);
    });
    expect(stale).toEqual([]);
  });

  it('the rules catch what they are for (planted)', () => {
    const planted = [
      'const s = `You are ${away}m from the job site`',
      'const s = `${(m / 1000).toFixed(1)} km`',
      'return `${km(leg.meters)} km`',
      'const label = `${distance}m`',
    ];
    for (const line of planted) expect([line, RULES.some((r) => !r.ext && r.re.test(line))]).toEqual([line, true]);
    expect(RULES.some((r) => r.re.test('<Text>{distanceM}m</Text>'))).toBe(true);
    // …and leave durations alone.
    expect(RULES.some((r) => !r.ext && r.re.test('return `${h}h ${m}m`'))).toBe(false);
  });
});
