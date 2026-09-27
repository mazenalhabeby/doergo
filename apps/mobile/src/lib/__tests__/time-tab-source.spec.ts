/**
 * The Time tab, read as source — the decisions that are easy to undo by
 * accident: one ground, one header, one copy of the shift, the home's card,
 * and no staffing figure where a member asks for leave.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TIME = fs.readdirSync(path.join(SRC, 'components/time')).filter((f) => /\.tsx?$/.test(f)).map((f) => `components/time/${f}`);

describe('one ground, one header', () => {
  it('there is ONE gradient — no variant, no interior ground, no second glass grey', () => {
    expect(strip(read('components/amazen/ground.tsx'))).not.toMatch(/variant/);
    expect(strip(read('theme/amazen.ts'))).not.toMatch(/interior|inkOnGlassHome/);
    for (const f of ['home/home-screen.tsx', 'components/jobs-list/jobs-screen.tsx', 'components/job/job-page.tsx', 'components/new-job/new-job-screen.tsx', 'components/time/time-screen.tsx']) {
      expect(strip(read(f))).not.toMatch(/<Ground[^>]*variant=/);
    }
  });

  it('the header reads the avatar itself — no screen passes it', () => {
    expect(read('components/amazen/screen-header.tsx')).toMatch(/useProfileAvatar\(\)/);
    const users = ['home/home-screen.tsx', 'components/jobs-list/jobs-screen.tsx', 'components/new-job/new-job-screen.tsx', 'components/time/time-screen.tsx'];
    for (const f of users) expect(read(f)).not.toMatch(/avatarUrl=|onPressAvatar=|initials=/);
  });

  it('the Time tab stands on the shared ground and draws the shared header', () => {
    const src = read('components/time/time-screen.tsx');
    expect(src).toMatch(/<Ground style=/);
    expect(src).toMatch(/<ScreenHeader/);
    expect(read('../app/(app)/(tabs)/attendance.tsx')).toMatch(/<TimeScreen \/>/);
  });
});

describe('the home\'s card, with one copy of the shift', () => {
  it('the page renders the card VIEW with its own shift and totals — one load for the screen', () => {
    const src = read('components/time/time-screen.tsx');
    expect(src).toMatch(/<ShiftClockCardView[\s\S]*?shift=\{shift\}[\s\S]*?totals=\{totals\}/);
    expect(src.match(/useShift\(\)/g)?.length).toBe(1);
  });

  it('the card view never loads the shift itself', () => {
    const card = read('components/home/shift-clock-card.tsx');
    const view = card.slice(card.indexOf('export function ShiftClockCardView'));
    expect(view).not.toMatch(/useShift\(\)/);
    expect(view).toMatch(/enabled: !given &&/);
  });

  it('on the Time tab the figure is not a link to the page you are on', () => {
    expect(read('components/time/time-screen.tsx')).toMatch(/linkToTime=\{false\}/);
  });
});

describe('time off asks for no staffing figures', () => {
  it('the request sheet never reads cover or availability — those are gated on canViewSpaceAttendance', () => {
    for (const f of TIME) expect(strip(read(f))).not.toMatch(/availabilityApi|cover-range|floor-now|coverRange/);
  });

  it('one copy of a member\'s leave for both screens', () => {
    expect(read('components/time/time-off-section.tsx')).toMatch(/useMyTimeOff/);
  });
});

describe('words', () => {
  it('no "paid" anywhere on the Time tab', () => {
    for (const f of [...TIME, 'components/worklog-sheet.tsx']) {
      expect(strip(read(f)).replace(/paidMinutes/g, '')).not.toMatch(/\bpaid\b|\bunpaid\b/i);
    }
  });

  it('every time.* key the page reads exists in all five languages', () => {
    const langs = ['en', 'de', 'es', 'fr', 'it'].map((l) => JSON.parse(read(`i18n/locales/${l}.json`)));
    const get = (o: Record<string, unknown>, k: string) => k.split('.').reduce<unknown>((a, p) => (a as Record<string, unknown>)?.[p], o);
    const keys = new Set<string>();
    for (const f of [...TIME, 'components/worklog-sheet.tsx']) {
      for (const m of read(f).matchAll(/t\('((?:time|worklog)\.[a-zA-Z.]+)'/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) {
      for (const l of langs) {
        const v = get(l, k) ?? get(l, `${k}_one`) ?? get(l, `${k}_other`);
        expect([k, typeof v]).toEqual([k, 'string']);
      }
    }
  });
});
