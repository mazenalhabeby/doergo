/**
 * Dragging a widget makes the others part to show where it will land.
 *
 * The arithmetic is re-derived here rather than imported: `arrangeable.tsx`
 * pulls in gesture-handler and Reanimated, neither of which jest transforms,
 * and the part worth testing is the maths rather than the plumbing. The first
 * test asserts the constants still match the source so the copy cannot drift.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const GAP = 13;

/** Real widget heights: a tall shift card, then a mix. Nothing is uniform. */
const H = [210, 92, 110, 96, 96, 96, 120];
const topOf = (i: number) => H.slice(0, i).reduce((a, b) => a + b + GAP, 0);

/** Which slot is the dragged row's CENTRE over? */
function landsAt(drag: number, dy: number): number {
  const centre = topOf(drag) + dy + H[drag]! / 2;
  let to = 0;
  let cursor = 0;
  for (let n = 0; n < H.length; n++) {
    const mid = cursor + H[n]! / 2;
    if (n !== drag && centre > mid) to++;
    cursor += H[n]! + GAP;
  }
  return to;
}

/** How far a row that is NOT being dragged steps aside. */
function shiftOf(row: number, drag: number, hover: number): number {
  if (row === drag) return 0;
  const h = H[drag]! + GAP;
  if (drag < row && hover >= row) return -h;
  if (drag > row && hover <= row) return h;
  return 0;
}

describe('the column parts for the widget being dragged', () => {
  it('uses the same gap the component does', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/amazen/arrangeable.tsx'), 'utf8');
    expect(src).toContain('gap = 13');
  });

  /*
    ⚠️ PRESS AND HOLD IS THE ONLY WAY IN, AND THE HOLD BECOMES THE DRAG.

    The Arrange button is gone, so if the hold stops working there is no way to
    rearrange the home screen at all — and nothing on screen would say so.
  */
  describe('the way into arrange mode', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/amazen/arrangeable.tsx'), 'utf8');
    const home = fs.readFileSync(path.join(SRC, 'home/home-screen.tsx'), 'utf8');

    it('activates on a long press while reading, and on travel while arranging', () => {
      expect(src).toMatch(/\? chained\.activeOffsetY\(\[-10, 10\]\)/);
      expect(src).toMatch(/: chained\.activateAfterLongPress\(HOLD\)/);
    });

    it('never lets movement alone pick a widget up while reading', () => {
      /*
        An `activeOffset` outside the arranging branch would mean a flick on
        the home screen starts a drag. There must be exactly one in the CODE —
        the comments mention it, so they come out first.
      */
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      expect(code.match(/activeOffsetY/g) ?? []).toHaveLength(1);
    });

    /*
      ⚠️ THE GESTURE MUST BE ONE UNBROKEN EXPRESSION, AND EVERY CALLBACK MUST
      SAY `'worklet'`.

      Reanimated's Babel plugin workletizes gesture callbacks by RECOGNISING
      the builder chain. Written as separate statements —

          const g = Gesture.Pan();
          if (arranging) g.activeOffsetY([-10, 10]);
          g.onStart(() => { … });

      — it reads identically and is not: the plugin stops recognising it,
      silently gives up, and the whole drag runs on the JS thread instead of
      the UI thread. Nothing fails. Nothing looks wrong in review. The only
      sign was a single line in logcat:

        [react-native-gesture-handler] None of the callbacks in the gesture
        are worklets.

      It shipped that way and made the drag markedly worse on the phone.
    */
    it('keeps the builder chain unbroken', () => {
      const body = src.slice(src.indexOf('const pan = React.useMemo'), src.indexOf('const style = useAnimatedStyle'));
      // a bare `g.onSomething(` statement is the shape that breaks the plugin
      expect(body).not.toMatch(/^\s*g\s*\n?\s*\.on[A-Z]/m);
      expect(body).toMatch(/const chained = g\s*\n\s*\.onStart\(/);
    });

    it("marks every gesture callback 'worklet' so it never depends on the plugin", () => {
      // ⚠️ Comments first — the prose above mentions `onStart` by name.
      const body = src
        .slice(src.indexOf('const pan = React.useMemo'), src.indexOf('const style = useAnimatedStyle'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      const handlers = body.match(/\.(onStart|onUpdate|onEnd|onTouchesCancelled)\(/g) ?? [];
      expect(handlers.length).toBe(4);
      expect((body.match(/'worklet';/g) ?? []).length).toBe(handlers.length);
    });

    it('only makes the scroll view wait while arranging', () => {
      expect(src).toMatch(/return arranging && scrollRef[\s\S]{0,20}\? configured\.blocksExternalGesture/);
    });

    it('turns the mode on from inside the gesture, so the same finger drags', () => {
      const onStart = src.slice(src.indexOf('.onStart('), src.indexOf('.onUpdate('));
      expect(onStart).toContain('runOnJS(onBeginArrange)()');
    });

    it('renders the column through the drag layer in BOTH modes', () => {
      /*
        If reading and arranging were two different trees, the long press would
        activate and the tree would swap under it — the gesture torn down at the
        instant the finger started to move.
      */
      expect(home).not.toMatch(/\{arranging \? \(\s*<Arrangeable/);
      expect(home).toMatch(/<Arrangeable[\s\S]{0,200}arranging=\{arranging\}/);
    });

  });

  describe('the header and the way back', () => {
    const home = fs.readFileSync(path.join(SRC, 'home/home-screen.tsx'), 'utf8');

    it('shows no action at all while reading — the Arrange button is gone', () => {
      const a = home.slice(home.indexOf('actions={'), home.indexOf('/>', home.indexOf('actions={')));
      expect(a).toContain('arranging');
      expect(a).toContain(': undefined');
      expect(a).not.toMatch(/'Arrange'/);
    });

    /*
      ⚠️ NOTHING THAT APPEARS WITH THE MODE MAY LIVE IN THE COLUMN.

      Both phones keep to one rule: entering edit mode does not move the
      content. iOS jiggles the icons where they stand and puts its Edit control
      in a corner of the chrome; the Android launcher opens a floating menu
      over a grid that does not shift.

      A dashed "Add a widget" row at the head of the column broke that by
      construction — worth about 60pt, so it shoved every widget down the
      instant the mode opened, under the finger that had just opened it.
      Hiding it during drags only moved the same 60pt to the start of every
      drag, and a widget landed a slot away from where it was aimed. Three
      attempts, one cause.

      The header is outside the ScrollView. Nothing put there can move the
      column.
    */
    it('puts add-a-widget in the header, never back in the column', () => {
      const scroll = home.slice(home.indexOf('<ScrollView'));
      expect(scroll).not.toContain('home.arrange.add');
      const header = home.slice(home.indexOf('<ScreenHeader'), home.indexOf('<ScrollView'));
      expect(header).toContain('home.arrange.add');
    });

    it('holds for at least as long as the system does', () => {
      /*
        iOS `minimumPressDuration` and Android `getLongPressTimeout()` are both
        500ms. This was 450 — under both, so it fired before the member
        expected and caught the start of scrolls.
      */
      const gesture = fs.readFileSync(path.join(SRC, 'components/amazen/arrangeable.tsx'), 'utf8');
      const m = gesture.match(/const HOLD = (\d+);/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(500);
    });

    it('lets the Android back gesture leave the mode, not the screen', () => {
      expect(home).toContain("BackHandler.addEventListener('hardwareBackPress'");
      const h = home.slice(home.indexOf('hardwareBackPress'));
      expect(h.slice(0, 160)).toContain('setArranging(false)');
    });


  });

  /*
    ⚠️ THE ANDROID HALF OF THE DROP — THREE RULES, NONE OF WHICH COST iOS
    ANYTHING, WHICH IS WHY THE SAME CODE FELT CLEAN ON AN IPHONE AND HITCHED
    ON A PHONE.

    `elevation` is Android-only and is not just paint: it feeds the sibling
    DRAW ORDER. React Native also implements `zIndex` on Android by re-sorting
    the ViewGroup's children. So two of the properties this style sets are
    re-sort triggers, and the third is the reorder itself.
  */
  describe('the drop does not make Android re-sort three times in one frame', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/amazen/arrangeable.tsx'), 'utf8');
    const style = src.slice(src.indexOf('const style = useAnimatedStyle'));

    it('never ramps elevation — it has two states, not a curve', () => {
      // `elevation: lifted.value * 12` asked Android to recompute the outline,
      // the shadow and the sibling order sixty times a second.
      expect(style).not.toMatch(/elevation:\s*lifted\.value/);
      expect(style).toMatch(/elevation:\s*12/);
    });

    it('keeps the lift raised through the commit, driven by lifted not dragging', () => {
      // `dragging` is cleared in the same commit that REORDERS the column.
      expect(style).toMatch(/const raised = lifted\.value > 0/);
      expect(style).toMatch(/d === index \|\| \(d === -1 && raised\)/);
    });

    it('the row layout effect clears the offset but NOT the lift', () => {
      const effect = src.slice(
        src.indexOf('React.useLayoutEffect(() => {\n    y.value = 0;'),
      ).slice(0, 120);
      expect(effect).toContain('y.value = 0');
      expect(effect).not.toContain('lifted.value = 0');
    });
  });

  /*
    ⚠️ THE FLIGHT HOME MUST NOT GO BACK TO BEING A SPRING.

    The reorder commits in this animation's completion callback, so how long it
    takes to report `finished` is how long the list stays frozen in drag state
    after the finger has gone. `withSpring({duration: 240, dampingRatio: 1})`
    approaches asymptotically and only calls back inside Reanimated's rest
    thresholds — measured on a real drop, **394ms**. The widget was visibly
    home after ~100ms and then nothing happened for a third of a second, which
    is the hitch a user reports as "a glitch when I release".

    `withTiming` calls back at its duration. Measured after the change: 193,
    198 and 216ms over three drops.
  */
  it('flies home on a timing curve, so the commit is not late', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/amazen/arrangeable.tsx'), 'utf8');
    const end = src.slice(src.indexOf('.onEnd('), src.indexOf('.onTouchesCancelled('));
    expect(end).toContain('withTiming(newTop - oldTop, { ...FLIGHT }');
    expect(end).not.toContain('withSpring(newTop - oldTop');
    expect(src).toMatch(/const FLIGHT = \{[\s\S]*?duration: 1[0-9]{2},/);
  });

  /*
    A guard, not a nicety: the failure it pins is invisible on the first drag
    and looks like an animation bug on the second, so nobody would think to
    come back here.
  */
  it('rebuilds the height table in the layout effect that follows a reorder', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/amazen/arrangeable.tsx'), 'utf8');
    const effect = src.slice(src.indexOf("const order = keys.join('|')"));
    const body = effect.slice(0, effect.indexOf('}, ['));
    expect(body).toContain('heights.value = keys.map(');
  });

  it('stays put until the centre passes a neighbour', () => {
    /*
      ⚠️ Centre, not top edge. Dragged by the top, a tall widget swaps places
      the moment its corner crosses a boundary — long before it looks like it
      should, and the taller the widget the wronger it feels.
    */
    expect(landsAt(1, 0)).toBe(1);
    expect(landsAt(1, 40)).toBe(1);
    expect(landsAt(1, 140)).toBe(2);
  });

  it('opens a gap the size of the widget being moved, not the one stepping aside', () => {
    // Row 2 steps aside for row 1: it moves by row 1's height, so the hole
    // that opens fits what is going into it.
    expect(shiftOf(2, 1, 2)).toBe(-(H[1]! + GAP));
    // And for the tall shift card, by the shift card's height.
    expect(shiftOf(2, 0, 2)).toBe(-(H[0]! + GAP));
  });

  it('moves every row the dragged widget has passed, and no others', () => {
    const hover = landsAt(1, 340); // three slots down
    const shifts = H.map((_, i) => shiftOf(i, 1, hover));
    expect(hover).toBe(4);
    expect(shifts).toEqual([0, 0, -(H[1]! + GAP), -(H[1]! + GAP), -(H[1]! + GAP), 0, 0]);
  });

  it('parts downward when a widget is dragged up', () => {
    const hover = landsAt(4, -260);
    expect(hover).toBeLessThan(4);
    for (let i = hover; i < 4; i++) expect(shiftOf(i, 4, hover)).toBe(H[4]! + GAP);
    expect(shiftOf(5, 4, hover)).toBe(0);
  });

  it('never lands outside the column', () => {
    for (const drag of [0, 3, 6]) {
      for (const dy of [-9999, -300, 0, 300, 9999]) {
        const to = landsAt(drag, dy);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(H.length);
      }
    }
  });

  /*
    ⚠️ WHERE THE WIDGET FLIES TO ON RELEASE.

    The first cut set the offset to 0 on release: the widget teleported back to
    where the DRAG STARTED, and the re-render then put it in its new slot — two
    jumps at the exact moment the gesture should feel finished. That was the
    "drop is not smooth".

    So it animates to where it will sit once the list is reordered, and commits
    on arrival. That only works if the two numbers agree EXACTLY — a pixel of
    disagreement is a visible twitch at the end of every drag.
  */
  it('flies to exactly where the reorder will put it', () => {
    const landingOffset = (index: number, to: number) => {
      const oldTop = topOf(index);
      let newTop = 0;
      let placed = 0;
      for (let n = 0; n < H.length && placed < to; n++) {
        if (n === index) continue;
        newTop += H[n]! + GAP;
        placed++;
      }
      return newTop - oldTop;
    };

    /** Where it really ends up once the array has been reordered. */
    const afterReorder = (index: number, to: number) => {
      const order = [...H.keys()];
      order.splice(index, 1);
      order.splice(to, 0, index);
      const pos = order.indexOf(index);
      return order.slice(0, pos).reduce((a, i) => a + H[i]! + GAP, 0) - topOf(index);
    };

    for (let i = 0; i < H.length; i++) {
      for (let to = 0; to < H.length; to++) {
        expect(landingOffset(i, to)).toBeCloseTo(afterReorder(i, to), 6);
      }
    }
  });

  /*
    ⚠️ THE HEIGHT TABLE MUST BE RE-ORDERED WITH THE COLUMN.

    `heights` is an array BY POSITION, and it is rebuilt only when a row
    REPORTS a new height. A reorder changes no height, so nothing reports and
    the table goes on describing the order before the swap. Every number below
    is then read off the wrong card: the threshold, the neighbour's step aside,
    and the landing spot the widget flies to.

    This is the whole of "when I drop the widget, the widget in that place
    moves up and then both jump — one up and one down — and then settle": the
    flight is short, the parting is too far, and the layout corrects both at
    the instant the drag should already be over. The FIRST drag is perfect,
    which is what hid it.
  */
  describe('after a reorder', () => {
    const KEYS = ['shift', 'docs', 'work', 'route', 'crew', 'needs', 'clients'];
    /** What `onLayout` recorded, keyed by widget — this never goes stale. */
    const MEASURED: Record<string, number> = Object.fromEntries(
      KEYS.map((k, i) => [k, H[i]!]),
    );
    /** What the component now does in its layout effect. */
    const tableFor = (keys: string[]) => keys.map((k) => MEASURED[k] ?? 0);

    const swap = (keys: string[], from: number, to: number) => {
      const out = [...keys];
      const [k] = out.splice(from, 1);
      out.splice(to, 0, k!);
      return out;
    };

    it('re-orders the table so no widget is measured as its neighbour', () => {
      const after = swap(KEYS, 0, 1);
      expect(tableFor(after)).toEqual([H[1], H[0], H[2], H[3], H[4], H[5], H[6]]);
      // The stale table — what shipped — read the tall shift card's height for
      // the short documents row that had taken its place.
      expect(tableFor(after)).not.toEqual(H);
    });

    it('lands the second drag exactly where the layout puts it', () => {
      const after = swap(KEYS, 0, 1); // documents is now first, shift second
      const T = tableFor(after);

      const landingOffset = (table: number[], index: number, to: number) => {
        const oldTop = table.slice(0, index).reduce((a, b) => a + b + GAP, 0);
        let newTop = 0;
        let placed = 0;
        for (let n = 0; n < table.length && placed < to; n++) {
          if (n === index) continue;
          newTop += table[n]! + GAP;
          placed++;
        }
        return newTop - oldTop;
      };

      /** Where the REORDERED column actually puts it — the ground truth. */
      const truth = (index: number, to: number) => {
        const order = [...T.keys()];
        order.splice(index, 1);
        order.splice(to, 0, index);
        const pos = order.indexOf(index);
        return (
          order.slice(0, pos).reduce((a, i) => a + T[i]! + GAP, 0) -
          T.slice(0, index).reduce((a, b) => a + b + GAP, 0)
        );
      };

      for (let i = 0; i < T.length; i++) {
        for (let to = 0; to < T.length; to++) {
          expect(landingOffset(T, i, to)).toBeCloseTo(truth(i, to), 6);
        }
      }

      // And the stale table gets it wrong by the difference between the two
      // cards that swapped — 118pt, which is what the eye saw jump.
      expect(landingOffset(H, 0, 1)).toBe(H[1]! + GAP);
      expect(landingOffset(T, 0, 1)).toBe(T[1]! + GAP);
      expect(landingOffset(H, 0, 1) - landingOffset(T, 0, 1)).toBe(H[1]! - H[0]!);
    });

    it('parts the neighbour by the height of the card actually being dragged', () => {
      const after = swap(KEYS, 0, 1);
      const T = tableFor(after);
      const shiftWith = (table: number[], row: number, drag: number, hover: number) => {
        if (row === drag) return 0;
        const h = table[drag]! + GAP;
        if (drag < row && hover >= row) return -h;
        if (drag > row && hover <= row) return h;
        return 0;
      };
      // Dragging the (now first) documents row down one slot.
      expect(shiftWith(T, 1, 0, 1)).toBe(-(H[1]! + GAP));
      // The stale table made it step aside by the tall shift card instead.
      expect(shiftWith(H, 1, 0, 1)).toBe(-(H[0]! + GAP));
    });

    it('keeps a widget the picker has just added out of the arithmetic at zero', () => {
      // Nothing has reported a height for it yet; it must not borrow one.
      expect(tableFor([...KEYS, 'unmeasured']).at(-1)).toBe(0);
    });
  });

  it('flies nowhere when the widget is dropped where it started', () => {
    // No movement to animate, and no reorder to commit.
    const landingOffset = (index: number, to: number) => {
      const oldTop = topOf(index);
      let newTop = 0;
      let placed = 0;
      for (let n = 0; n < H.length && placed < to; n++) {
        if (n === index) continue;
        newTop += H[n]! + GAP;
        placed++;
      }
      return newTop - oldTop;
    };
    for (let i = 0; i < H.length; i++) expect(landingOffset(i, i)).toBe(0);
  });
});
