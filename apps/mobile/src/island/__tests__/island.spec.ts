import fs from 'fs';
import path from 'path';
import {
  CAP, EDGE, GAP, ICON, ICON_GAP, SIDE,
  readLayout, sealedBox, shapeFor, type Cutout, type Measured,
} from '../geometry';
import { androidCutout, cutoutFromInset } from '../cutout';
import { TONES, dwellFor, ISLAND } from '../tokens';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Readex Pro at 15pt / weight 500, measured off the real font — the widths the
 * spec quotes. `Clocked in` is 67pt, which is the whole point of §4.
 */
const W = { 'Clocked in': 67, 'Overtime approved': 114, 'Anna approved your overtime': 147 } as const;
const msg = (title: keyof typeof W, extra: Partial<Measured> = {}): Measured => ({
  title: W[title], value: 42, bodyLines: 0, action: false, ...extra,
});

/* The phones in §6 of the drawing, by name. */
const DYNAMIC_ISLAND: Cutout = { x: (393 - 126) / 2, y: 11, w: 126, h: 37, kind: 'floating' };
const PIXEL: Cutout = { x: (412 - 26) / 2, y: 14, w: 26, h: 26, kind: 'floating' };
const HARD_LEFT: Cutout = { x: 22, y: 14, w: 24, h: 24, kind: 'floating' };
const HARD_RIGHT: Cutout = { x: 286, y: 14, w: 52, h: 26, kind: 'floating' };
const NOTCH: Cutout = { x: (390 - 209) / 2, y: 0, w: 209, h: 30, kind: 'edge' };
const TEARDROP: Cutout = { x: (393 - 60) / 2, y: 0, w: 60, h: 18, kind: 'edge' };
const NONE: Cutout = { x: 375 / 2, y: 0, w: 0, h: 0, kind: 'none' };

describe('the one law — the camera covers nothing, ever', () => {
  const phones: [string, Cutout, number][] = [
    ['Dynamic Island', DYNAMIC_ISLAND, 393],
    ['Pixel ⌀26', PIXEL, 412],
    ['hard-left ⌀24', HARD_LEFT, 393],
    ['hard-right pill', HARD_RIGHT, 393],
    ['notch', NOTCH, 390],
    ['teardrop', TEARDROP, 393],
    ['no cutout', NONE, 375],
  ];

  it.each(phones)('%s · nothing is ever laid out under the lens', (_name, hole, screenW) => {
    for (const title of Object.keys(W) as (keyof typeof W)[]) {
      for (const bodyLines of [0, 2]) {
        const l = readLayout({ hole, screenW, measured: msg(title, { bodyLines }) });

        /* ⚠️ The box may cover the hole — it is meant to WRAP it. What must
           never happen is CONTENT in the dead zone. */
        if (hole.kind === 'floating') {
          if (!l.titleDrops) {
            // The title sits in the left slot and must end before the hole.
            expect(ICON + ICON_GAP + msg(title).title).toBeLessThanOrEqual(l.left);
          }
          // A dropped title starts below the head row, never beside the lens.
          if (l.titleDrops) expect(l.open.h).toBeGreaterThan(l.sealed.h);
        }
        if (hole.kind === 'edge') {
          /* ⚠️ Docked UNDER the cutout — never across it. */
          expect(l.open.y).toBeGreaterThanOrEqual(hole.y + hole.h);
        }

        /* ⚠️ Never wider than the cap, never within 8pt of an edge. */
        expect(l.open.w).toBeLessThanOrEqual(Math.min(CAP, screenW - EDGE * 2));
        expect(l.open.x).toBeGreaterThanOrEqual(EDGE);
        expect(l.open.x + l.open.w).toBeLessThanOrEqual(screenW - EDGE);
      }
    }
  });

  it('the lens never moves — the box grows from the HOLE\'s centre', () => {
    /*
      ⚠️ Anchored to the hole, not to itself. If the camera appears to slide,
      the illusion dies in one frame — §8 rule 1.
    */
    const centre = PIXEL.x + PIXEL.w / 2;
    for (const title of Object.keys(W) as (keyof typeof W)[]) {
      const l = readLayout({ hole: PIXEL, screenW: 412, measured: msg(title) });
      expect(l.open.x + l.open.w / 2).toBeCloseTo(centre, 0);
    }
  });
});

describe('§4 — the ladder, first rung that fits', () => {
  it('⚠️ `Clocked in` DROPS on a Dynamic Island — rung 3 is the normal form', () => {
    /*
      The slots are 96pt each; minus the icon and its gap the title gets 66pt,
      about nine characters. `Clocked in` measures 67. It does not fit.
    */
    const l = readLayout({ hole: DYNAMIC_ISLAND, screenW: 393, measured: msg('Clocked in') });
    expect(l.rung).toBe(3);
    expect(l.titleDrops).toBe(true);
    expect(l.open.radius).toBe(30);
    // And the slot really is about 96 with ~66 left for a title.
    expect(Math.round(l.left)).toBeLessThan(100);
    expect(Math.round(l.left - ICON - ICON_GAP)).toBeLessThan(W['Clocked in']);
  });

  it('the same phrase stays on ONE line on a Pixel ⌀26', () => {
    const l = readLayout({ hole: PIXEL, screenW: 412, measured: msg('Clocked in') });
    expect(l.titleDrops).toBe(false);
    expect(l.rung).toBeLessThanOrEqual(2);
    expect(l.open.radius).toBe(999);
  });

  it('a body forces rung 4, not a taller rung 3', () => {
    const l = readLayout({ hole: DYNAMIC_ISLAND, screenW: 393, measured: msg('Anna approved your overtime', { bodyLines: 2 }) });
    expect(l.rung).toBe(4);
    expect(l.titleDrops).toBe(true);
  });

  it('⚠️ a hard-left camera is rung 5 — the icon moves to the RIGHT slot', () => {
    /* A hole at x=22 leaves a left slot of about −5pt: not even the icon. */
    const l = readLayout({ hole: HARD_LEFT, screenW: 393, measured: msg('Anna approved your overtime') });
    expect(l.left).toBeLessThan(ICON);
    expect(l.rung).toBe(5);
    expect(l.icon).toBe('right');
    expect(l.titleDrops).toBe(true);
  });

  it('German is measured, not assumed', () => {
    /*
      ⚠️ German and French run 30–40% longer. A string that is rung 2 in
      English is rung 3 in German, and the only way to know is to measure.
    */
    const english = readLayout({ hole: PIXEL, screenW: 412, measured: msg('Overtime approved') });
    const german = readLayout({ hole: PIXEL, screenW: 412, measured: { ...msg('Overtime approved'), title: 114 * 1.38 } });
    expect(english.titleDrops).toBe(false);
    expect(german.titleDrops).toBe(true);
    // ⚠️ And nothing is ever clipped or ellipsised to make it fit.
    expect(code('island/island-view.tsx')).not.toMatch(/ellipsizeMode|adjustsFontSizeToFit/);
  });
});

describe('§5 — the three shapes', () => {
  it('a floating cutout wraps, an edge one docks, none gets a rect', () => {
    expect(shapeFor('floating')).toBe('wrap');
    expect(shapeFor('edge')).toBe('dock');
    expect(shapeFor('none')).toBe('rect');
  });

  it('wrap surrounds the hole', () => {
    const s = sealedBox(PIXEL, 412);
    expect(s.y).toBeLessThan(PIXEL.y);
    expect(s.x).toBeLessThan(PIXEL.x);
    expect(s.x + s.w).toBeGreaterThan(PIXEL.x + PIXEL.w);
    expect(s.radius).toBe(999);
  });

  it('⚠️ a notch is DOCKED under, because you cannot wrap the bezel', () => {
    const s = sealedBox(NOTCH, 390);
    expect(s.y).toBe(NOTCH.y + NOTCH.h + 8);
    expect(s.radius).toBe(999);
    const l = readLayout({ hole: NOTCH, screenW: 390, measured: msg('Clocked in') });
    // A dock has no lens in its row, so a short phrase stays on one line.
    expect(l.titleDrops).toBe(false);
    expect(l.left).toBe(0);
  });

  it('no cutout is a rect at radius 22, not a pill floating next to nothing', () => {
    const s = sealedBox(NONE, 375);
    expect(s.y).toBe(12);
    expect(s.h).toBe(40);
    expect(s.radius).toBe(22);
  });
});

describe('§2 — measure the phone, never assume', () => {
  it('maps the three iOS answers', () => {
    expect(cutoutFromInset(59, 393)).toMatchObject({ w: 126, h: 37, kind: 'floating' });
    expect(cutoutFromInset(47, 390)).toMatchObject({ w: 209, h: 30, kind: 'edge' });
    expect(cutoutFromInset(20, 375)).toMatchObject({ kind: 'none' });
  });

  it('⚠️ an under-display camera reports nothing, and nothing is guessed', () => {
    expect(androidCutout(0, 1812)).toMatchObject({ kind: 'none' });
  });

  it('⚠️ where Android cannot hand over the rects, the answer is conservative', () => {
    /*
      Inventing a rect from the status-bar height would break the one law on
      exactly the phones a crew is most likely to be issued. Treating the whole
      band as cutout docks under it and cannot overlap anything.
    */
    const c = androidCutout(28, 412);
    expect(c.kind).toBe('edge');
    const l = readLayout({ hole: c, screenW: 412, measured: msg('Clocked in') });
    expect(l.open.y).toBeGreaterThanOrEqual(28);
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

  it('⚠️ failed and queued never collapse on their own', () => {
    expect(dwellFor('failed', false)).toBe(0);
    expect(dwellFor('failed', true)).toBe(0);
    expect(dwellFor('queued', false)).toBe(0);
    // 4s with an action, 3s without — §10.
    expect(dwellFor('done', false)).toBe(3000);
    expect(dwellFor('done', true)).toBe(4000);
    // ⚠️ `live` IS the collapsed state, so it has no clock at all.
    expect(dwellFor('live', false)).toBe(0);
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
    expect((view.match(/Haptics\.impactAsync/g) ?? []).length).toBe(1);
    const collapse = view.slice(view.indexOf('if (message || !shown) return;'), view.indexOf('const commit'));
    expect(collapse).not.toMatch(/Haptics/);
  });

  it('⚠️ reduce motion cross-fades — no spring, no travel, no overshoot', () => {
    const branch = view.slice(view.indexOf('if (reduceMotion) {'), view.indexOf('} else {'));
    expect(branch).not.toMatch(/withSpring/);
    expect(branch).toMatch(/REDUCED/);
  });

  it('⚠️ one island, and the live shift wins the collapsed state', () => {
    expect(ctx).toMatch(/setCurrent\(next \?\? liveMsg\)/);
    expect(ctx).toMatch(/QUEUE_CAP = 3/);
    expect(ctx).toMatch(/slice\(-QUEUE_CAP\)/);
  });

  it('⚠️ every arrival is announced, and nothing auto-dismisses inside 6s with a screen reader', () => {
    expect(view).toMatch(/announceForAccessibility/);
    expect(ctx).toMatch(/SCREEN_READER_MIN_DWELL/);
    expect(ctx).toMatch(/Math\.max\(current\.dwell, SCREEN_READER_MIN_DWELL\)/);
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
    // ⚠️ And the new one the whole idea is for.
    expect(ctx).toMatch(/live: \(\{ label, value: figure \}\)/);
    expect(ctx).toMatch(/clearLive/);
  });

  it('⚠️ the live shift is mounted above the tabs, not inside a card', () => {
    const layout = fs.readFileSync(path.join(SRC, '../app/(app)/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/useLiveShift\(\)/);
  });
});

describe('the constants are the spec\'s', () => {
  it('§3', () => {
    expect([GAP, SIDE, ICON, ICON_GAP, CAP, EDGE]).toEqual([6, 13, 21, 9, 356, 8]);
  });
});
