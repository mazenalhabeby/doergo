import fs from 'fs';
import path from 'path';
import {
  CAP, DOT, EDGE, GAP, ICON, ICON_GAP, SIDE,
  readLayout, sealedBox, sealedVisible, type Cutout, type Measured,
} from '../geometry';
import { androidCutout, cutoutFromInset } from '../cutout';
import { TONES, dwellFor, ISLAND } from '../tokens';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Readex Pro at 15pt / weight 500, measured off the real font. */
const W = { 'Clocked in': 67, 'Overtime approved': 114, 'Anna approved your overtime': 147 } as const;
const msg = (title: keyof typeof W, extra: Partial<Measured> = {}): Measured => ({
  title: W[title], value: 42, bodyLines: 0, action: false, ...extra,
});

const DYNAMIC_ISLAND = cutoutFromInset(59, 393);
const IPHONE_13 = cutoutFromInset(47, 390, 'iPhone14,5');
const IPHONE_11 = cutoutFromInset(48, 414, 'iPhone12,1');
const PIXEL: Cutout = { x: (412 - 26) / 2, y: 14, w: 26, h: 26, kind: 'floating' };
const HARD_LEFT: Cutout = { x: 22, y: 14, w: 24, h: 24, kind: 'floating' };
const SE = cutoutFromInset(20, 375);

describe('the one law — the camera covers nothing, ever', () => {
  const phones: [string, Cutout, number][] = [
    ['Dynamic Island', DYNAMIC_ISLAND, 393],
    ['iPhone 13 notch', IPHONE_13, 390],
    ['iPhone 11 notch', IPHONE_11, 414],
    ['Pixel ⌀26', PIXEL, 412],
    ['hard-left ⌀24', HARD_LEFT, 393],
    ['iPhone SE', SE, 375],
  ];

  it.each(phones)('%s · icon left of the lens, time right of it, nothing under it', (_n, hole, screenW) => {
    for (const title of Object.keys(W) as (keyof typeof W)[]) {
      for (const bodyLines of [0, 2]) {
        const m = msg(title, { bodyLines });
        const l = readLayout({ hole, screenW, topInset: 20, measured: m });
        if (!l.titleDrops && l.icon === 'left') expect(ICON + ICON_GAP + m.title).toBeLessThanOrEqual(l.left);
        if (l.icon === 'left') expect(ICON).toBeLessThanOrEqual(l.left);
        expect(m.value).toBeLessThanOrEqual(l.right);
        /* Never wider than the cap, never within 8pt of an edge. */
        expect(l.open.w).toBeLessThanOrEqual(Math.min(CAP, screenW - EDGE * 2));
        expect(l.open.x).toBeGreaterThanOrEqual(EDGE);
        expect(l.open.x + l.open.w).toBeLessThanOrEqual(screenW - EDGE);
      }
    }
  });

  it.each(phones.filter(([n]) => !n.startsWith('hard-left')))('%s · the lens never moves — the box grows from the hole\'s centre', (_n, hole, screenW) => {
    const l = readLayout({ hole, screenW, topInset: 20, measured: msg('Clocked in') });
    expect(l.open.x + l.open.w / 2).toBeCloseTo(hole.x + hole.w / 2, 0);
    expect(l.lens.x + l.open.x).toBeCloseTo(hole.x, 5);
  });
});

describe('born at the cutout, grows left and right', () => {
  it('⚠️ on a notch the island starts as EXACTLY the notch — flush, square top', () => {
    const s = sealedBox(IPHONE_13, 390, 47);
    expect(s).toMatchObject({ x: IPHONE_13.x, y: 0, w: IPHONE_13.w, h: IPHONE_13.h, radiusTop: 0 });
    const l = readLayout({ hole: IPHONE_13, screenW: 390, topInset: 47, measured: msg('Clocked in') });
    expect(l.open.y).toBe(0);
    expect(l.open.radiusTop).toBe(0);
    expect(l.open.w).toBeGreaterThan(IPHONE_13.w);
    /* The head row is the notch's own band. */
    expect(l.headHeight).toBeGreaterThanOrEqual(IPHONE_13.h);
  });

  it('⚠️ the notch comes from the model — a 13 is narrower than an 11', () => {
    expect(IPHONE_13.w).toBeLessThan(IPHONE_11.w);
    expect(IPHONE_13.kind).toBe('edge');
    /* An unknown notch phone falls back WIDE, never narrow. */
    expect(cutoutFromInset(47, 390, 'iPhone99,9').w).toBeGreaterThanOrEqual(IPHONE_13.w);
  });

  it('the Dynamic Island starts as a pill around the lens and stays drawn when idle', () => {
    const s = sealedBox(DYNAMIC_ISLAND, 393, 59);
    expect(s.w).toBe(126 + 20);
    expect(s.radiusTop).toBe(999);
    expect(sealedVisible(DYNAMIC_ISLAND)).toBe(true);
  });

  it('⚠️ idle, nothing is drawn on a notch, an SE or an assumed Android lens', () => {
    expect(sealedVisible(IPHONE_13)).toBe(false);
    expect(sealedVisible(SE)).toBe(false);
    expect(sealedVisible(androidCutout(28, 412))).toBe(false);
    const view = code('island/island-view.tsx');
    expect(view).toMatch(/\{!msg && !idle \? null : \(/);
  });

  it('⚠️ coming from nothing, the box is SET to the cutout before it springs out', () => {
    const view = code('island/island-view.tsx');
    const born = view.slice(view.indexOf('if (!shown && !idle) {'), view.indexOf('if (reduceMotion) {'));
    expect(born).toMatch(/w\.value = sealed\.w;/);
    expect(born).toMatch(/x\.value = sealed\.x;/);
    /* …and back into it on the way out. */
    expect(view).toMatch(/w\.value = withDelay\(80, to\(sealed\.w\)\)/);
  });

  it('an SE grows from a dot under the status bar', () => {
    const s = sealedBox(SE, 375, 20);
    expect(s).toMatchObject({ y: 26, w: DOT, h: DOT });
    expect(s.x + s.w / 2).toBe(375 / 2);
  });
});

describe('what does not fit beside the lens goes under it', () => {
  it('⚠️ on a notch the title drops under it — the height grows for it', () => {
    const l = readLayout({ hole: IPHONE_13, screenW: 390, topInset: 47, measured: msg('Anna approved your overtime') });
    expect(l.titleDrops).toBe(true);
    expect(l.icon).toBe('left');
    expect(l.open.h).toBeGreaterThan(l.headHeight);
  });

  it('a long title drops on a Dynamic Island; a short one stays beside a Pixel lens', () => {
    expect(readLayout({ hole: DYNAMIC_ISLAND, screenW: 393, topInset: 59, measured: msg('Anna approved your overtime') }).titleDrops).toBe(true);
    expect(readLayout({ hole: PIXEL, screenW: 412, topInset: 28, measured: msg('Clocked in') }).titleDrops).toBe(false);
  });

  it('⚠️ 05.png · a wrapped title is MEASURED — the estimate undercounted and cut a line off', () => {
    const m = { ...msg('Anna approved your overtime'), title: 700, titleWrapped: 4 };
    const est = readLayout({ hole: IPHONE_13, screenW: 390, topInset: 47, measured: { ...m, titleWrapped: undefined } });
    const real = readLayout({ hole: IPHONE_13, screenW: 390, topInset: 47, measured: m });
    expect(real.open.h).toBeGreaterThan(est.open.h);
    expect(code('island/island-view.tsx')).toMatch(/widths\.current\.titleWrapped = e\.nativeEvent\.lines\.length/);
  });

  it('the height follows the content — a body makes it taller, more lines taller still', () => {
    const at = (bodyLines: number) =>
      readLayout({ hole: IPHONE_13, screenW: 390, topInset: 47, measured: msg('Clocked in', { bodyLines }) }).open.h;
    expect(at(1)).toBeGreaterThan(at(0));
    expect(at(3)).toBeGreaterThan(at(1));
  });

  it('a one-line message with no body stays one row, at its natural width', () => {
    const l = readLayout({ hole: PIXEL, screenW: 412, topInset: 28, measured: msg('Clocked in') });
    expect(l.rung).toBe(1);
    expect(l.open.h).toBe(l.headHeight);
    expect(l.open.w).toBeLessThan(CAP);
  });

  it('⚠️ a hard-left camera moves the icon to the right slot', () => {
    const l = readLayout({ hole: HARD_LEFT, screenW: 393, topInset: 28, measured: msg('Anna approved your overtime') });
    expect(l.rung).toBe(5);
    expect(l.icon).toBe('right');
  });

  it('German is measured, not assumed', () => {
    const en = readLayout({ hole: PIXEL, screenW: 412, topInset: 28, measured: msg('Overtime approved') });
    const de = readLayout({ hole: PIXEL, screenW: 412, topInset: 28, measured: { ...msg('Overtime approved'), title: 114 * 1.38 } });
    expect(en.titleDrops).toBe(false);
    expect(de.titleDrops).toBe(true);
    expect(code('island/island-view.tsx')).not.toMatch(/ellipsizeMode|adjustsFontSizeToFit/);
  });

  it('an icon and a figure with no title — one row HUGGING the notch', () => {
    /* ⚠️ 05.png: a phantom icon gap sent it to the full cap width. */
    const l = readLayout({ hole: IPHONE_13, screenW: 390, topInset: 47, measured: { title: 0, value: 20, bodyLines: 0, action: false } });
    expect(l.rung).toBe(1);
    expect(l.open.w).toBeLessThan(IPHONE_13.w + 120);
    expect(l.titleDrops).toBe(false);
    expect(l.open.h).toBe(l.headHeight);
  });

  it('⚠️ the status bar hides while the island is open over it', () => {
    expect(code('island/island-status-bar.tsx')).toMatch(/hidden=\{statusBarHidden\}/);
    expect(code('island/island-context.tsx')).toMatch(/statusBarHidden = !!current && coversStatusBar\(hole\)/);
  });

  it('⚠️ Android with no cutout module: a centred lens in the status bar, marked assumed', () => {
    const c = androidCutout(28, 412);
    expect(c.kind).toBe('floating');
    expect(c.assumed).toBe(true);
    expect(c.x + c.w / 2).toBe(206);
    expect(c.y + c.h).toBeLessThanOrEqual(28);
  });
});

describe('§6/§7 — the colours and the tones', () => {
  it('⚠️ the island is black in both themes, and so is its ink', () => {
    expect(ISLAND.bg).toBe('#000000');
    const view = code('island/island-view.tsx');
    const tokens = code('island/tokens.ts');
    // ⚠️ Never wired to the app theme — that is the decision it all rests on.
    for (const src of [view, tokens, code('island/island-context.tsx')]) {
      expect(src).not.toMatch(/useTheme\(\)/);
      expect(src).not.toMatch(/isDark/);
    }
  });

  it('⚠️ queued is not failed', () => {
    expect(TONES.queued.fg).toBe(ISLAND.dim);
    expect(TONES.queued.fg).not.toBe(ISLAND.crit);
    // ⚠️ And mono, because the thing being counted is a queue.
    expect(TONES.queued.mono).toBe(true);
  });

  it('⚠️ NOTHING STAYS — every tone closes on its own after a few seconds', () => {
    for (const tone of Object.keys(TONES) as (keyof typeof TONES)[]) {
      for (const action of [false, true]) {
        const d = dwellFor(tone, action);
        expect(d).toBeGreaterThanOrEqual(3000);
        expect(d).toBeLessThanOrEqual(5000);
      }
    }
    expect(dwellFor('done', false)).toBe(3000);
    expect(dwellFor('done', true)).toBe(4000);
    expect('live' in TONES).toBe(false);
  });
});

describe('04.png — how it reads', () => {
  const view = code('island/island-view.tsx');
  it('⚠️ filled icons only', () => {
    expect(view).toMatch(/done: 'checkmark-circle'/);
    expect(view).not.toMatch(/-outline'/);
  });
  it('⚠️ the time is always on the right — the arrival time when there is no figure', () => {
    expect(view).toMatch(/value: message\.value \?\? stamp\(\)/);
  });
  it('⚠️ "Success" is not news — the sentence becomes the title', () => {
    const ctx = code('island/island-context.tsx');
    expect(ctx).toMatch(/\{ \.\.\.tidy\(msg\), id: nextId\.current\+\+ \}/);
    expect(ctx).toMatch(/title: msg\.body, body: undefined/);
    /* ⚠️ 05.png: only a SHORT sentence — a long one stays the body, in full ink. */
    expect(ctx).toMatch(/msg\.body\.length <= 48/);
    expect(view).toMatch(/!msg\.title && styles\.bodyAlone/);
  });
  it('uses the app\'s own type — Readex for words, Plex Mono for the time', () => {
    expect(view).toMatch(/fontFamily: FONT\.sansMedium, fontSize: 16/);
    expect(view).toMatch(/fontFamily: FONT\.monoMedium/);
  });
});

describe('§8/§10 — the motion and the rules', () => {
  const view = code('island/island-view.tsx');
  const ctx = code('island/island-context.tsx');

  it('one spring, and the height is late so it widens THEN drops', () => {
    expect(view).toMatch(/damping: 26, stiffness: 240, mass: 1/);
    expect(view).toMatch(/withDelay\(40, withSpring\(layout\.open\.h/);
    // ⚠️ A second message re-targets the spring; a timing curve gives it away.
    expect(view).toMatch(/w\.value = withSpring/);
  });

  it('⚠️ the rung is decided before anything animates, and never re-measured', () => {
    // Measured off-screen first, then committed.
    expect(view).toMatch(/styles\.measure/);
    expect(view).toMatch(/onTextLayout/);
    expect(code('island/geometry.ts')).toMatch(/export function readLayout/);
  });

  it('⚠️ the body fades BEFORE the box shrinks', () => {
    const collapse = view.slice(view.indexOf('if (message || !shown) return;'));
    expect(collapse.indexOf('body.value = withTiming(0')).toBeLessThan(collapse.indexOf('w.value = withDelay(80'));
  });

  it('⚠️ one haptic on arrival, never on collapse', () => {
    expect((view.match(/\bimpact\('light'\)/g) ?? []).length).toBe(1);
    const collapse = view.slice(view.indexOf('if (message || !shown) return;'), view.indexOf('const commit'));
    expect(collapse).not.toMatch(/\bimpact\(/);
  });

  it('⚠️ reduce motion cross-fades — no spring, no travel, no overshoot', () => {
    const branch = view.slice(view.indexOf('if (reduceMotion) {'), view.indexOf('} else {'));
    expect(branch).not.toMatch(/withSpring/);
    expect(branch).toMatch(/REDUCED/);
  });

  it('⚠️ swipe up closes it early — up only, and far enough to mean it', () => {
    const view = code('island/island-view.tsx');
    expect(view).toMatch(/Gesture\.Pan\(\)/);
    expect(view).toMatch(/activeOffsetY\(\[-12, 999\]\)/);
    expect(view).toMatch(/e\.translationY < -24 && msg/);
    expect(view).toMatch(/<GestureDetector gesture=\{swipe\}>/);

    /*
      ⚠️ AND THE TAP HAS TO BE A GESTURE TOO. The island was covered by a
      `Pressable` at `StyleSheet.absoluteFill`, and RN's responder system
      claims a touch on it the instant it goes down — so the pan never
      activated and the swipe did nothing at all. Two systems arguing over one
      surface, and the one covering the whole area wins.
    */
    expect(view).toMatch(/Gesture\.Tap\(\)/);
    expect(view).toMatch(/Gesture\.Exclusive\(pan, tap\)/);
    const island = view.slice(view.indexOf('<GestureDetector'), view.indexOf('</GestureDetector>'));
    expect(island).not.toMatch(/<Pressable[^>]*absoluteFill/);

  });

  it('⚠️ one island, nothing persistent — a finished message goes to the next or to nothing', () => {
    expect(ctx).toMatch(/setCurrent\(queue\.current\.shift\(\) \?\? null\)/);
    expect(ctx).not.toMatch(/liveMsg|clearLive|liveHidden/);
    expect(fs.existsSync(path.join(SRC, 'island/use-live-shift.ts'))).toBe(false);
    expect(ctx).toMatch(/QUEUE_CAP = 3/);
    expect(ctx).toMatch(/slice\(-QUEUE_CAP\)/);
  });

  it('⚠️ every arrival is announced, and nothing auto-dismisses inside 6s with a screen reader', () => {
    expect(view).toMatch(/announceForAccessibility/);
    expect(ctx).toMatch(/SCREEN_READER_MIN_DWELL/);
    expect(ctx).toMatch(/Math\.max\(base, SCREEN_READER_MIN_DWELL\)/);
  });
});

describe('§11 — what is deleted, and stays deleted', () => {
  it('the toast is gone, and none of it came across', () => {
    expect(fs.existsSync(path.join(SRC, 'contexts/toast-context.tsx'))).toBe(false);
    const files = ['island/island-view.tsx', 'island/island-context.tsx', 'island/tokens.ts'];
    for (const f of files) {
      const src = code(f);
      // ⚠️ The banner at insets.top + 8 that landed on the greeting.
      expect(src).not.toMatch(/insets\.top \+ 8/);
      // ⚠️ A BlurView imported and never rendered — a bug, not a style.
      expect(src).not.toMatch(/BlurView/);
      // ⚠️ Twelve hardcoded Tailwind ramps that do not re-skin.
      expect(src).not.toMatch(/#ECFDF5|#A7F3D0|#059669|TOAST_THEME/);
    }
  });

  it('⚠️ the API keeps its old shape, so the swap is one line', () => {
    const ctx = code('island/island-context.tsx');
    for (const fn of ['success', 'error', 'warning', 'info', 'showToast']) {
      expect(ctx).toMatch(new RegExp(`${fn}\\b`));
    }
    expect(ctx).toMatch(/export function useToast/);
  });

});

describe('the constants are the spec\'s', () => {
  it('§3', () => {
    expect([GAP, SIDE, ICON, ICON_GAP, CAP, EDGE]).toEqual([6, 18, 22, 9, 372, 8]);
  });
});
