import fs from 'fs';
import path from 'path';
import {
  CAP, EDGE, GAP, ICON, ICON_GAP, SIDE, VISOR_RADIUS, VISOR_ROW,
  readLayout, reserveFor, sealedBox, shapeFor, type Cutout, type Measured,
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
        const l = readLayout({ hole, screenW, topInset: 47, measured: msg(title, { bodyLines }) });

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
        if (hole.kind !== 'floating') {
          /*
            ⚠️ FLUSH — `y: 0`, NO GAP, EVER. A gap makes it a card hovering
            under the status bar, which is the toast this replaced.
          */
          expect(l.open.y).toBe(0);
          /*
            ⚠️ AND A VISOR IS CLEARED HORIZONTALLY, NOT VERTICALLY — §5.5. The
            clock is far left, the battery far right, and `visorCap` keeps the
            visor short of both, which is the rule doing the real work.
          */
          /*
            ⚠️ A VISOR CONTAINS THE CUTOUT INSTEAD OF MATCHING IT — §5.5,
            rewritten. Full width, so it cannot be the wrong width, and the
            band above the content row holds the status bar and the cutout
            whatever size that really is.
          */
          expect(l.open.x).toBe(0);
          expect(l.open.w).toBe(screenW);
          expect(l.headTop).toBe(47);
          expect(l.headTop).toBeGreaterThanOrEqual(hole.y + hole.h);
        }

        /* ⚠️ A wrap is never wider than the cap, never within 8pt of an edge. */
        if (hole.kind === 'floating') {
          expect(l.open.w).toBeLessThanOrEqual(Math.min(CAP, screenW - EDGE * 2));
          expect(l.open.x).toBeGreaterThanOrEqual(EDGE);
          expect(l.open.x + l.open.w).toBeLessThanOrEqual(screenW - EDGE);
        }
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
      const l = readLayout({ hole: PIXEL, screenW: 412, topInset: 47, measured: msg(title) });
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
    const l = readLayout({ hole: DYNAMIC_ISLAND, screenW: 393, topInset: 47, measured: msg('Clocked in') });
    expect(l.rung).toBe(3);
    expect(l.titleDrops).toBe(true);
    expect(l.open.radiusTop).toBe(30);
    // And the slot really is about 96 with ~66 left for a title.
    expect(Math.round(l.left)).toBeLessThan(100);
    expect(Math.round(l.left - ICON - ICON_GAP)).toBeLessThan(W['Clocked in']);
  });

  it('the same phrase stays on ONE line on a Pixel ⌀26', () => {
    const l = readLayout({ hole: PIXEL, screenW: 412, topInset: 47, measured: msg('Clocked in') });
    expect(l.titleDrops).toBe(false);
    expect(l.rung).toBeLessThanOrEqual(2);
    expect(l.open.radiusTop).toBe(999);
  });

  it('a body forces rung 4, not a taller rung 3', () => {
    const l = readLayout({ hole: DYNAMIC_ISLAND, screenW: 393, topInset: 47, measured: msg('Anna approved your overtime', { bodyLines: 2 }) });
    expect(l.rung).toBe(4);
    expect(l.titleDrops).toBe(true);
  });

  it('⚠️ a hard-left camera is rung 5 — the icon moves to the RIGHT slot', () => {
    /* A hole at x=22 leaves a left slot of about −5pt: not even the icon. */
    const l = readLayout({ hole: HARD_LEFT, screenW: 393, topInset: 47, measured: msg('Anna approved your overtime') });
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
    const english = readLayout({ hole: PIXEL, screenW: 412, topInset: 47, measured: msg('Overtime approved') });
    const german = readLayout({ hole: PIXEL, screenW: 412, topInset: 47, measured: { ...msg('Overtime approved'), title: 114 * 1.38 } });
    expect(english.titleDrops).toBe(false);
    expect(german.titleDrops).toBe(true);
    // ⚠️ And nothing is ever clipped or ellipsised to make it fit.
    expect(code('island/island-view.tsx')).not.toMatch(/ellipsizeMode|adjustsFontSizeToFit/);
  });
});

describe('§5 — the three shapes', () => {
  it('⚠️ only a floating cutout wraps — everything else is the visor', () => {
    /*
      §5: there is no `dock` any more. An `edge` cutout and no cutout at all
      are the same shape; the only difference is whether part of the black is
      the hardware's. `dock` put the island 8pt BELOW the cutout, and that gap
      is the entire problem — a black pill with daylight above it is the toast
      this replaced.
    */
    expect(shapeFor('floating')).toBe('wrap');
    expect(shapeFor('edge')).toBe('visor');
    expect(shapeFor('none')).toBe('visor');
    const geo = code('island/geometry.ts');
    expect(geo).not.toMatch(/'dock'/);
    expect(geo).not.toMatch(/hole\.h \+ 8/);
  });

  it('wrap surrounds the hole', () => {
    const s = sealedBox(PIXEL, 412, 47);
    expect(s.y).toBeLessThan(PIXEL.y);
    expect(s.x).toBeLessThan(PIXEL.x);
    expect(s.x + s.w).toBeGreaterThan(PIXEL.x + PIXEL.w);
    expect(s.radiusTop).toBe(999);
  });

  it('⚠️ the visor CONTAINS the cutout — full width, so it cannot be wrong', () => {
    /*
      §5.5, rewritten. Everything that tried to match a cutout is deleted:
      `visorCap()`, the `screenW - 180` rule, `VISOR_MIN`, the measured band
      and the centred row.

      ⚠️ THE WIDTH COULD NEVER HAVE BEEN RIGHT, BECAUSE `hole` IS FABRICATED.
      Measured from the running app on a 16e:
      `insetTop 47 · hole {x: 90.5, w: 209} · open.w 130.57` — a visor 79pt
      NARROWER than the notch it hung below. And `209` came from an iPhone XR;
      iOS exposes no API for the cutout rectangle at all.
    */
    for (const [hole, screenW] of [[NOTCH, 390], [TEARDROP, 393], [NONE, 375]] as const) {
      const v = sealedBox(hole, screenW, 47);
      expect(v.x).toBe(0);
      expect(v.w).toBe(screenW);
      expect(v.y).toBe(0);
      expect(v.h).toBe(47 + VISOR_ROW);
      expect(v.radiusTop).toBe(0);
      expect(v.radiusBottom).toBe(VISOR_RADIUS);
    }

    /* ⚠️ Nothing left that measures or matches a cutout. */
    const geo = code('island/geometry.ts');
    for (const gone of ['visorCap', 'VISOR_MIN', 'visorBand', 'cutoutIntrudes', 'visorHeight']) {
      expect(geo).not.toMatch(new RegExp(`(export (function|const) )${gone}\\b`));
    }

    const l = readLayout({ hole: NOTCH, screenW: 390, topInset: 47, measured: msg('Clocked in') });
    expect(l.titleDrops).toBe(false);
    expect(l.left).toBe(0);
  });

  it('⚠️ only a floating cutout gets `wrap` — 126×37 is the one safe constant', () => {
    /*
      It is identical on every Dynamic Island iPhone. Everything else gets the
      visor, which matches nothing and therefore cannot be the wrong width.

      ⚠️ THE COST, STATED PLAINLY: on a notch iPhone there is no island
      effect — a black top bar that holds the shift. Correct on every phone
      ever made, and no per-model table to break on the next one.
    */
    expect(shapeFor('floating')).toBe('wrap');
    expect(sealedBox(DYNAMIC_ISLAND, 393, 59).radiusTop).toBe(999);
    expect(sealedBox(NOTCH, 390, 47).radiusTop).toBe(0);
  });
});

describe('§5.1–5.4 — the dock and rect paths', () => {
  it('⚠️ 5.2/5.5 · the no-cutout form grows FROM the edge, so it cannot collide with the status bar', () => {
    /*
      The bug §5.2 names was `y: 12` — a constant that lands on the clock and
      the battery on an iPhone SE, whose status bar occupies 0 → 20. §5.5
      settles it without an inset at all: the visor is FLUSH at `y: 0` and is
      cleared HORIZONTALLY by `visorCap`, so there is nothing to collide with
      and nothing to thread through.
    */
    for (const [screenW, top] of [[375, 20], [393, 59], [412, 28]] as const) {
      const v = sealedBox(NONE, screenW, top);
      expect(v.y).toBe(0);
      /* The band holds the status bar, so the height follows the inset. */
      expect(v.h).toBe(top + VISOR_ROW);
    }
    // ⚠️ No floating constant left in the geometry.
    const geo = code('island/geometry.ts');
    expect(geo).not.toMatch(/y: topInset \+ 8/);
    expect(geo).not.toMatch(/y: 12,/);
  });

  it('⚠️ 5.5.2 · on a visor the ladder collapses and the bar grows a line at a time', () => {
    /*
      The row has `screenW - 26` of usable width — about 320pt on a 390pt
      phone — so one line is almost always the answer. There is no dead zone
      to route around and no cap to run into, because the visor matches
      nothing.

      ⚠️ AND A TITLE THAT STILL WILL NOT FIT WRAPS INSIDE THE SAME BAR. It
      does not drop below a lens, because there is no lens. The bar grows by
      one `VISOR_ROW` per line and nothing else moves.
    */
    const one = readLayout({ hole: NONE, screenW: 390, topInset: 47, measured: msg('Clocked in') });
    expect(one.rung).toBe(1);
    expect(one.titleDrops).toBe(false);
    expect(one.open.h).toBe(47 + VISOR_ROW);
    expect(one.headHeight).toBe(VISOR_ROW);

    /* Even the longest string in the spec stays on one line here. */
    const long = readLayout({ hole: NOTCH, screenW: 390, topInset: 47, measured: msg('Anna approved your overtime') });
    expect(long.rung).toBe(1);
    expect(long.open.h).toBe(47 + VISOR_ROW);

    /* Past the row's width it wraps, in place, one row taller. */
    const wraps = readLayout({
      hole: NONE, screenW: 390, topInset: 47,
      measured: { ...msg('Anna approved your overtime'), title: 500 },
    });
    expect(wraps.titleDrops).toBe(false);
    expect(wraps.open.w).toBe(390);
    expect(wraps.open.h).toBe(47 + VISOR_ROW * 2);
    expect(wraps.headHeight).toBe(VISOR_ROW * 2);
  });

  it('⚠️ 5.5 · there is NO sealed visor — idle, it is not rendered', () => {
    /*
      A black bar across the top of every screen that says nothing is a
      mistake the user looks at all day. With no message and no live shift the
      visor unmounts; a `wrap` keeps its sealed pill, because on those phones
      the cutout is already there.
    */
    const view = code('island/island-view.tsx');
    expect(view).toMatch(/\{chrome && !msg \? null : \(/);
    expect(view).toMatch(/opacity: vis\.value/);
    expect(view).toMatch(/useSharedValue\(chrome \? 0 : 1\)/);
  });

  it('⚠️ 5.5.2 · a visor never springs — only its content changes', () => {
    /*
      The morph in §8 is a pill stretching around a lens. There is no lens
      here, so springing a full-width bar's width and radius animates nothing
      and wobbles the one surface that is on screen all day.
    */
    const view = code('island/island-view.tsx');
    const branch = view.slice(view.indexOf('if (chrome) {'), view.indexOf('} else if (reduceMotion)'));
    expect(branch).not.toMatch(/withSpring/);
    expect(branch).toMatch(/w\.value = layout\.open\.w;/);
    expect(branch).toMatch(/rTop\.value = layout\.open\.radiusTop;/);
    /* The content still cross-fades, and the haptic still fires. */
    expect(branch).toMatch(/head\.value = withDelay\(100, withTiming\(1/);
    expect(view).toMatch(/Haptics\.impactAsync/);
  });

  it('⚠️ the live state is a RING AND A FIGURE, not a sentence', () => {
    /*
      §7 shows it as `◎ 0m`, and the drawing says it in words: *while you are
      on the clock it never leaves — a ring and a running figure*.

      ⚠️ MEASURING ITS LABEL AS A TITLE MADE IT DROP. `On the clock · 1h 45m`
      exceeds the visor's cap, so the thing meant to sit quietly at the top of
      every screen all day became a black panel a third of the way down it.
      The label is for the screen reader.
    */
    const view = code('island/island-view.tsx');
    expect(view).toMatch(/const live = msg\.tone === 'live';/);
    expect(view).toMatch(/title: live \? 0 : widths\.current\.title/);
    expect(view).toMatch(/!layout\.titleDrops && msg\.tone !== 'live'/);
    // ⚠️ And the two sit together — the spacer is for separating a TITLE.
    expect(view).toMatch(/layout\.titleDrops \|\| msg\.tone === 'live' \? null : <View style=\{\{ flex: 1 \}\} \/>/);
    // It is still announced in full.
    expect(view).toMatch(/announceForAccessibility/);
  });

  it('⚠️ 5.5 · the content row sits below the status bar, inside the visor', () => {
    /*
      The band above it holds the status bar and, on a notch phone, the notch
      itself — whatever size that really is. That is the point of containing
      the cutout rather than matching it: nothing here depends on knowing how
      big it is.
    */
    for (const hole of [NONE, NOTCH, TEARDROP]) {
      const l = readLayout({ hole, screenW: 390, topInset: 47, measured: msg('Clocked in') });
      expect(l.headTop).toBe(47);
      expect(l.headHeight).toBe(VISOR_ROW);
      expect(l.headTop).toBeGreaterThanOrEqual(hole.y + hole.h);
    }
    /* A wrap has no band at all — its row is beside the lens. */
    expect(readLayout({ hole: PIXEL, screenW: 412, topInset: 44, measured: msg('Clocked in') }).headTop).toBe(0);
    expect(code('island/island-view.tsx')).toMatch(/marginTop: layout\.headTop/);
  });

  it('⚠️ 5.5 · the status-bar ink goes light on a visor, through the ONE StatusBar', () => {
    /*
      A visor is black and light mode draws dark icons on it. ⚠️ Not a second
      `<StatusBar>`: there is exactly one in this tree and the comment beside
      it records the bug that came from having two.
    */
    const bar = code('island/island-status-bar.tsx');
    expect(bar).toMatch(/isDark \|\| visorShowing \? 'light' : 'dark'/);
    /* Comments quote what they forbid — strip them, as `code` does. */
    const layout = fs
      .readFileSync(path.join(SRC, '../app/_layout.tsx'), 'utf8')
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '');
    /*
      ⚠️ EXACTLY ONE inside the island's tree. The two above it are the splash
      and the update-required screens, which return early and never coexist
      with the provider.
    */
    const inTree = layout.slice(layout.indexOf('<IslandProvider'));
    expect((inTree.match(/<StatusBar/g) ?? []).length).toBe(0);
    expect(inTree).toMatch(/<IslandStatusBar isDark=\{isDark\} \/>/);
    expect(code('island/island-context.tsx')).toMatch(/visorShowing = shape === 'visor' && !!current/);
  });

  it('⚠️ 5.3 · a visor never grows a top, and a wrap becomes a panel', () => {
    /*
      §5.3's bug was asking the rung before the shape, which made a dropped
      card ROUNDER as it grew. A visor is flush: square at the top however
      tall it gets, 26 at the bottom, always.
    */
    for (const measured of [msg('Clocked in'), { ...msg('Clocked in'), title: 500, bodyLines: 2 }]) {
      const v = readLayout({ hole: NONE, screenW: 375, topInset: 20, measured });
      expect(v.open.radiusTop).toBe(0);
      expect(v.open.radiusBottom).toBe(VISOR_RADIUS);
    }

    /* A wrap IS a pill, so 999 → 30 is the pill becoming a panel. */
    const pill = readLayout({
      hole: DYNAMIC_ISLAND, screenW: 393, topInset: 59,
      measured: { ...msg('Anna approved your overtime'), bodyLines: 2 },
    });
    expect(pill.titleDrops).toBe(true);
    expect(pill.open.radiusTop).toBe(30);
    expect(pill.open.radiusBottom).toBe(30);
  });

  it('⚠️ 5.1 · the live state RESERVES space on dock and rect, and never on wrap', () => {
    /*
      An iPhone 13 docks at y:38 height 36 — 38 → 74 — while the safe area
      starts at 47, so it sits on the first 27pt of the app's own content. Fine
      for four seconds; not fine for a pill that stays all day. The first cut
      shipped exactly that: the ring covered `Friday, September 25`.
    */
    /*
      ⚠️ A CONSTANT, BECAUSE THE VISOR'S GEOMETRY IS ONE — §5.5.3. It is
      `topInset + VISOR_ROW + 8 - topInset`, so the app simply starts 42pt
      lower during a shift. That area is the visor's.
    */
    expect(reserveFor('visor')).toBe(VISOR_ROW + 8);
    expect(reserveFor('visor')).toBe(42);

    /* ⚠️ On wrap there is nothing to reserve — it is inside the area the app
       already avoids. */
    expect(reserveFor('wrap')).toBe(0);

    const ctx = code('island/island-context.tsx');
    // ⚠️ Only the LIVE state reserves — a transient message must never move the app.
    expect(ctx).toMatch(/liveMsg && !liveHidden \? reserveFor\(shape\)/);
    expect(ctx).toMatch(/: 0;/);

    /*
      ⚠️ PUBLISHED, NOT PAINTED. Padding the provider's own children cut the
      gradient off at the padding and left a black band across the top with
      the clock and the battery on it — which `Ground` forbids in its own
      header and §5.5 draws the opposite of. The ground stays full-bleed and
      only what stands on it moves.
    */
    expect(ctx).toMatch(/reserve: target/);
    expect(ctx).not.toMatch(/paddingTop/);
    expect(ctx).not.toMatch(/backgroundColor/);

    const ground = code('components/amazen/ground.tsx');
    expect(ground).toMatch(/const \{ reserve \} = useIsland\(\)/);
    // The gradient is still absolute-fill, behind the push.
    expect(ground).toMatch(/style=\{StyleSheet\.absoluteFill\}/);
    expect(ground).toMatch(/paddingTop: push\.value/);
    // ⚠️ On the same spring as the box, so the app moves with it rather than jumping.
    expect(ground).toMatch(/withSpring\(reserve, \{ damping: 26, stiffness: 240, mass: 1 \}\)/);
  });

  it('⚠️ 5.4 · a visor holds far MORE text than a Dynamic Island', () => {
    /*
      The opposite of what you would guess, and the reason a green run on a
      notch phone proves nothing: a visor's row has no dead zone in the middle
      of it and no cap to run into. The Dynamic Island is the hard case, and
      it is the only one still doing the ladder.

      ⚠️ §5.4'S TABLE PREDATES ALL OF THIS — its shapes no longer exist.
    */
    const usable = (hole: Cutout, screenW: number) => {
      const l = readLayout({ hole, screenW, topInset: 47, measured: msg('Clocked in') });
      return hole.kind === 'floating'
        ? Math.round(l.left - ICON - ICON_GAP)
        : Math.round(screenW - SIDE * 2 - ICON - ICON_GAP - 42 - 24);
    };
    const island = usable(DYNAMIC_ISLAND, 393);
    const pixel = usable(PIXEL, 412);
    const notch = usable(NOTCH, 390);

    expect(island).toBeLessThan(70);
    expect(pixel).toBeGreaterThan(100);
    /* ~278pt on a 390pt phone — the whole row, less the icon and the figure. */
    expect(notch).toBeGreaterThan(island * 4);
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

  it('⚠️ a status bar is NOT a cutout — where Android cannot say, the answer is `none`', () => {
    /*
      §2, correcting an earlier version of the spec that said
      `WindowInsets.getDisplayCutout().boundingRects` was reachable from
      JavaScript. It is not — not in React Native, not in Expo, not in
      safe-area-context.

      ⚠️ The first cut fell back to `insets.top` as a full-width `edge`, and
      `insets.top` on Android is the status-bar height and is never 0 — so
      EVERY Android phone claimed hardware it does not have and the island
      docked under a band that is not there: a black pill floating in space.
    */
    const c = androidCutout(28, 412);
    expect(c.kind).toBe('none');
    expect(c.w).toBe(0);
    expect(shapeFor(c.kind)).toBe('visor');
    // ⚠️ And no path invents a rect from an inset.
    expect(code('island/cutout.ts')).not.toMatch(/w: screenW, h: top/);
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

  it('⚠️ swipe up dismisses — and the live shift could not be closed at all', () => {
    /*
      §10 says it and it was never built. The live shift IS the collapsed
      state, so a tap on it dismissed the message and `shift()` put it
      straight back: a black bar on the member's screen all day that nothing
      could close — a worse version of the fault this design replaced.

      ⚠️ UP ONLY, AND FAR ENOUGH TO MEAN IT. It sits under the status bar
      where the OS's own pull-down starts; a downward or half-hearted pan must
      do nothing, or people lose their shift clock reaching for the shade.
    */
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

    /*
      ⚠️ AND A TAP ON THE LIVE BAR CLOSES IT — a departure from §10, which
      says tap expands. The live shift has nothing to expand to, so tap was
      dead on the one surface that is on screen all day. A swipe alone is
      undiscoverable and competes with the OS pull-down two pixels above it.
    */
    expect(view).toMatch(/if \(m\.tone === 'live'\) \{ onSwipeAway\(m\); return; \}/);

    const ctx = code('island/island-context.tsx');
    /* ⚠️ Swiped away means "not for the rest of this shift". */
    expect(ctx).toMatch(/if \(msg\.tone === 'live'\) setLiveHidden\(true\)/);
    expect(ctx).toMatch(/setCurrent\(next \?\? \(liveHidden \? null : liveMsg\)\)/);
    /* ⚠️ And it reserves nothing once it is gone. */
    expect(ctx).toMatch(/liveMsg && !liveHidden \? reserveFor\(shape\) : 0/);
    /* ⚠️ The shift ending ends the dismissal — it is back on the next one. */
    const clear = ctx.slice(ctx.lastIndexOf('clearLive: () => {'));
    expect(clear.slice(0, 200)).toMatch(/setLiveHidden\(false\)/);
  });

  it('⚠️ one island, and the live shift wins the collapsed state', () => {
    expect(ctx).toMatch(/setCurrent\(next \?\? \(liveHidden \? null : liveMsg\)\)/);
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
