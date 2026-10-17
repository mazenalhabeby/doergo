/**
 * The three screens of `docs/design/home-screen.md`, and its eleven rules.
 *
 * ⚠️ THE SPEC CHANGED SHAPE AND SO DID THIS FILE. The version before it asked
 * for "a list with toggles and up/down arrows. Not a drag canvas", and this
 * test enforced it. The current one asks for the opposite — edit in place, drag
 * the real card, arrows only as `accessibilityActions` — so every assertion
 * about `arrange-sheet.tsx` went with the file. What survives is the pure
 * arithmetic in `arrange-list.ts`, which the accessibility arrows still use.
 */
import * as fs from 'fs';
import * as path from 'path';
import { move, hide, show, onHome, offHome, canMove } from '../../home/arrange-list';
import { readSource } from '../../test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => readSource(path.join(SRC, p), 'utf8');
/** Comments quote the things these rules forbid — strip them first. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const L = { keys: ['a', 'b', 'c', 'd'], hidden: ['c'] };

describe('rule 1 — edit in place. No arrange screen, no list of names', () => {
  it('has no arrange sheet and no hand-written drag layer', () => {
    expect(fs.existsSync(path.join(SRC, 'components/home/arrange-sheet.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'components/amazen/arrangeable.tsx'))).toBe(false);
  });

  it('the home screen renders the widgets themselves, in a draggable list', () => {
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/from 'react-native-draggable-flatlist'/);
    expect(home).toMatch(/<DraggableFlatList/);
    expect(home).toMatch(/<EditableWidget/);
  });
});

describe('rule 2 — drag the card, never a row', () => {
  const card = code('components/home/editable-widget.tsx');

  it('renders the widget itself, not a label', () => {
    expect(card).toMatch(/<row\.Component \/>/);
    // Nothing in the card draws the widget's NAME as its body.
    expect(card).not.toMatch(/<AText[^>]*>\s*\{title\}/);
  });

  it('binds the drag to the whole card', () => {
    expect(card).toMatch(/onLongPress=\{drag\}/);
  });

  it('§7 — uses the two decorators the design names, and no rotation', () => {
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/<ScaleDecorator activeScale=\{LIFT_FACTOR\}/);
    expect(home).toMatch(/<ShadowDecorator/);
    // ⚠️ Neither platform tilts a dragged card.
    expect(home).not.toMatch(/rotate/i);
    expect(card).not.toMatch(/rotate/i);
  });

  it('§3 — the lift is 1.02 ABSOLUTE, over a resting 0.965', () => {
    /*
      ⚠️ `ScaleDecorator` MULTIPLIES whatever the card is already at. Passing
      1.02 straight through would lift an editing card to 0.984 — it would read
      as the card getting SMALLER when you pick it up.
    */
    // Read from source: the module is TSX, and this is arithmetic, not render.
    expect(card).toMatch(/const REST = 0\.965;/);
    expect(card).toMatch(/export const LIFT_FACTOR = 1\.02 \/ REST;/);
    expect(0.965 * (1.02 / 0.965)).toBeCloseTo(1.02, 6);
  });

  it('§7 — sets an activation distance, so the iOS back-swipe still works', () => {
    expect(code('home/home-screen.tsx')).toMatch(/activationDistance=\{\d+\}/);
  });

  it('§3 — auto-scrolls within 60pt of an edge', () => {
    expect(code('home/home-screen.tsx')).toMatch(/autoscrollThreshold=\{60\}/);
  });

  it('§3 — the gap is a dashed jade slot', () => {
    expect(card).toMatch(/borderStyle: 'dashed'/);
    expect(card).toMatch(/borderWidth: 1\.5/);
    expect(card).toMatch(/borderColor: amazen\.color\.accent/);
  });
});

describe('rule 3 — previews are the real component, never a screenshot', () => {
  it('the empty home renders the component at .42, inert', () => {
    const empty = code('components/home/empty-home.tsx');
    expect(empty).toMatch(/<row\.Component \/>/);
    expect(empty).toMatch(/opacity: 0\.42/);
    expect(empty).toMatch(/pointerEvents="none"/);
  });

  it('the gallery renders the real component (scaled to fit), inert', () => {
    const gallery = code('components/home/widget-gallery.tsx');
    expect(gallery).toMatch(/<row\.Component \/>/);
    expect(gallery).toMatch(/pointerEvents="none"/);
    expect(gallery).not.toMatch(/Image|require\(/);
  });
});

describe('rule 4 — two suggestions, and only ones whose data arrived', () => {
  it('filters BEFORE it takes two, in one place', () => {
    /*
      ⚠️ THE RULE WAS SPLIT AND PICKED THE WRONG TWO. The screen took the first
      two off-screen widgets and `EmptyHome` then dropped the ones with no
      answer — so a first widget that had not loaded cost a suggestion while a
      ready third one sat unused. §1 asks for two, and for only ones whose data
      arrived: that is a filter then a take, not a take then a filter.
    */
    const home = code('home/home-screen.tsx');
    const at = home.indexOf('const suggestions');
    expect(at).toBeGreaterThan(-1);
    const block = home.slice(at, at + 500);
    expect(block.indexOf('.filter(')).toBeLessThan(block.indexOf('.slice(0, 2)'));
    // And the child renders what it is given rather than choosing again.
    expect(code('components/home/empty-home.tsx')).not.toMatch(/\.slice\(0, 2\)/);
  });

  it('offers no buttons when there is nothing behind them', () => {
    /*
      With nothing available the row rendered `See all 0` — a control that
      opens an empty sheet, offering a choice that does not exist. A member
      whose entitlement grants them no widget at all is a real case.
    */
    expect(code('components/home/empty-home.tsx')).toMatch(/totalAvailable === 0 \? null/);
  });

  it('drops a suggestion with no live answer rather than showing "loading"', () => {
    // The filter moved to where the choosing happens — see the test above.
    expect(code('home/home-screen.tsx')).toMatch(/s\.line !== null/);
  });

  it('one hook answers for every widget, and nothing in it fetches', () => {
    /*
      ⚠️ THE OBVIOUS SHAPE IS ILLEGAL. A `useAnswer()` on each registry row
      reads beautifully and is a hook called from a filtered list — the rows
      are filtered by entitlement and by what is already on the home, so the
      set changes between renders. `rules-of-hooks.spec.ts` exists here because
      that mistake has been made in this codebase before.

      ⚠️ AND IT MUST NOT FETCH. The question is asked about widgets that are
      NOT on the member's home — the two suggestions, and every page of the
      gallery — so a value that cost a request would fire one round trip per
      widget the member does not have, every time the sheet opens.
    */
    const answers = code('home/answers.ts');
    expect(answers).toMatch(/export function useWidgetAnswers\(\)/);
    expect(answers).not.toMatch(/Api\.|fetch\(|axios/);

    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/const answers = useWidgetAnswers\(\);/);
    // The screen looks a widget up. It never names one.
    expect(home).toMatch(/answerFor\(answers, row\.key\)/);
    expect(home).not.toMatch(/row\.key === '/);
  });

  it('separates "the answer arrived" from "the answer is zero"', () => {
    /*
      A count of zero is also what a member with nothing outstanding looks
      like. Offering somebody a card because it is still loading, and refusing
      them one because they are up to date, are two different mistakes with the
      same symptom — so `ready` is its own field.
    */
    const answers = code('home/answers.ts');
    expect(answers).toMatch(/ready: boolean;/);
    expect(answers).toMatch(/line: string \| null;/);
  });
});

describe('rule 5 — ⊖ is neutral, and removing deletes nothing', () => {
  const card = code('components/home/editable-widget.tsx');

  it('never draws the remove badge in red', () => {
    const badge = card.slice(card.indexOf('function RemoveBadge'));
    expect(badge.slice(0, 1200)).not.toMatch(/critical/);
  });

  it('draws it on a raised surface with an ink stroke', () => {
    const badge = card.slice(card.indexOf('function RemoveBadge'));
    expect(badge.slice(0, 1200)).toMatch(/backgroundColor: c\.barFill/);
    expect(badge.slice(0, 1200)).toMatch(/backgroundColor: c\.ink/);
  });

  it('keeps the key and its place when switched off', () => {
    const after = hide({ keys: ['a', 'b', 'c'], hidden: [] }, 'b');
    expect(after.keys).toEqual(['a', 'b', 'c']);
    expect(after.hidden).toEqual(['b']);
  });
});

describe('rule 6 — new widgets land near the top, several in one visit', () => {
  /*
    Replaced 2026-09-26 (the member asked): landing at the BOTTOM made them
    scroll to find what they had just chosen before they could place it, and
    closing the gallery on every Add meant one trip per widget.
  */
  it('lands under the first card, or after the one added before it', () => {
    const hook = code('home/use-home-layout.ts');
    expect(hook).toMatch(/const anchor = after \?\? rest\.find\(\(k\) => onHomeKeys\.has\(k\)\) \?\? null;/);
    expect(code('home/home-screen.tsx')).toMatch(/onAdd=\{\(key, after\) => layout\.add\(key, after\)\}/);
  });

  it('stays open while adding, and on Done rings every arrival in arrange mode', () => {
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/setPicking\(false\);[\s\S]{0,400}enterEdit\(\);\s*\n\s*land\(added\)/);
    expect(code('components/home/editable-widget.tsx')).toMatch(
      /export const LANDED_MS = 30_000;/,
    );
    // The ring's clock lives with the mode it belongs to, and is cleaned up.
    const editing = code('home/use-home-editing.ts');
    expect(editing).toMatch(/setTimeout\(\(\) => setLanded\(\[\]\), LANDED_MS\)/);
    expect(editing).toMatch(/clearTimeout\(ring\.current\)/);
  });
});

describe('rule 7 — entitlement decides membership, LAST, every render', () => {
  it('filters after the saved order', () => {
    const hook = read('home/use-home-layout.ts');
    const rows = hook.indexOf('const rows = useMemo');
    const ordered = hook.indexOf('const orderedKeys = useMemo');
    expect(ordered).toBeLessThan(rows);
    expect(hook.slice(rows)).toMatch(/byKey\.get\(k\)/);
  });

  it('asks the ACCESS question, not the raw storage one', () => {
    /*
      ⚠️ `hasAccessModule`, NEVER `hasModule` — the tab bar and the registry
      must ask the same question. Asking the wrong one hid the shift clock from
      every admin and every member whose profile was never configured, while
      the Clock TAB was shown to exactly those people.
    */
    const ent = code('home/entitlement.ts');
    expect(ent).toMatch(/hasAccessModule\(user as never, r\.module\)/);
    expect(ent).not.toMatch(/\bhasModule\(/);
  });
});

describe('rule 8 — a hidden key is never deleted from storage', () => {
  it('returns it to the place it always had', () => {
    const off = hide({ keys: ['a', 'b', 'c'], hidden: [] }, 'b');
    expect(onHome(show(off, 'b'))).toEqual(['a', 'b', 'c']);
  });

  it('offers a widget the member never had', () => {
    expect(offHome({ keys: ['a'], hidden: [] }, ['a', 'z'])).toEqual(['z']);
  });

  it('a drag never drops the keys entitlement filtered out of view', () => {
    /*
      ⚠️ ONE PIECE OF ARITHMETIC, NOT TWO. The drag and the accessibility
      arrows both write a new visible order back into the slots it already
      occupied; two copies is how one of them keeps a hidden key and the other
      loses it. Both go through `withVisibleOrder`.
    */
    const list = code('home/arrange-list.ts');
    expect(list).toMatch(/export function withVisibleOrder\(/);
    expect(list).toMatch(/visible\.has\(k\) \? ordered\[i\+\+\]/);
    const hook = code('home/use-home-layout.ts');
    expect(hook).toMatch(/withVisibleOrder\(orderedKeys, onHomeKeys, visibleKeys\)/);
    // `move` uses it too, rather than its own inline loop.
    expect(list).toMatch(/const keys = withVisibleOrder\(layout\.keys/);
  });
});

describe('rule 9 — glass on three cards only', () => {
  it('no row takes glass but shift clock, crew and clients', () => {
    /*
      ⚠️ A SUBSET, NOT AN EXACT LIST. The set is being rebuilt one widget at a
      time, so pinning the exact three fails on every day but the last. What
      the rule actually forbids is a FOURTH glass card, and that is what this
      asserts — true of an empty registry and true of a full one.
    */
    const registry = code('home/registry.tsx');
    const rows = [...registry.matchAll(/key: '([^']+)',[\s\S]*?surface: '(glass|well)'/g)]
      .map((m) => ({ key: m[1], surface: m[2] }));
    const glass = rows.filter((r) => r.surface === 'glass').map((r) => r.key);
    expect(glass.filter((k) => !['shift-clock', 'crew', 'clients'].includes(k))).toEqual([]);
  });
});

describe('rule 10 — arrows are accessibilityActions, visible only to a reader', () => {
  const card = code('components/home/editable-widget.tsx');

  it('every card carries the three actions', () => {
    expect(card).toMatch(/name: 'moveUp'/);
    expect(card).toMatch(/name: 'moveDown'/);
    expect(card).toMatch(/name: 'remove'/);
    expect(card).toMatch(/onAccessibilityAction=/);
  });

  it('draws them only when a screen reader is running', () => {
    expect(card).toMatch(/editing && screenReader \? \(\s*<Arrows/);
    expect(code('home/home-screen.tsx')).toMatch(/useScreenReader\(\)/);
  });

  it('announces the RESULT, not the act', () => {
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/announce\(/);
    expect(home).toMatch(/position \$\{at\} of \$\{rows\.length\}/);
  });

  it('the arrows move against what the member can SEE', () => {
    // `c` is hidden, so `b`'s neighbour downward is `d`.
    const { layout, moved } = move(L, 'b', 'down');
    expect(onHome(layout)).toEqual(['a', 'd', 'b']);
    expect(moved).toEqual({ key: 'b', direction: 'down', wasAt: 2 });
    expect(layout.keys.indexOf('c')).toBe(2);
  });

  it('nothing moves at either end, and the dead arrow dims rather than goes', () => {
    expect(move(L, 'a', 'up').moved).toBeNull();
    expect(move(L, 'd', 'down').moved).toBeNull();
    expect(canMove(0, 3)).toEqual({ up: false, down: true });
    expect(card).toMatch(/opacity: on \? 1 : 0\.35/);
  });

  it('Reduce Motion removes the animation and never the function', () => {
    expect(card).toMatch(/reduceMotion: ReduceMotion\.System/);
  });
});

describe('rule 11 — no placeholder is in the registry', () => {
  const registry = code('home/registry.tsx');

  it('registers nothing that says "not built yet"', () => {
    expect(registry).not.toMatch(/placeholder\(/);
    expect(registry).not.toMatch(/not built yet/);
  });

  it('every row it DOES have is complete', () => {
    /*
      Not "there are at least n" — the set is being rebuilt one at a time, and
      a count is not an invariant. Completeness is: every row carries a
      surface, an empty-state decision and a component.
    */
    const keys = [...registry.matchAll(/^    key: '([^']+)',$/gm)].map((m) => m[1]);
    for (const field of ['surface', 'empty', 'Component']) {
      const n = [...registry.matchAll(new RegExp(`^    ${field}:`, 'gm'))].length;
      expect(n).toBe(keys.length);
    }
  });

  it('the default order names widgets that exist', () => {
    /*
      ⚠️ A key that names nothing is skipped SILENTLY — which is right for a
      member whose entitlement changed, and hides a typo forever.
    */
    const keys = new Set(
      [...registry.matchAll(/^    key: '([^']+)',$/gm)].map((m) => m[1]),
    );
    const order = registry.slice(registry.indexOf('DEFAULT_ORDER'));
    const listed = [...order.matchAll(/'([a-z-]+)',/g)].map((m) => m[1]);
    for (const k of listed) expect(keys.has(k)).toBe(true);
  });
});

describe('§3 — entering the mode moves nothing', () => {
  it('shrinks the card with a transform, never a layout animation', () => {
    const card = code('components/home/editable-widget.tsx');
    expect(card).toMatch(/transform: \[\{ scale: shrink\.value \}\]/);
    expect(card).not.toMatch(/FadeIn|Layout|entering=/);
  });

  it('leaves room for what the first card draws OUTSIDE itself', () => {
    /*
      ⚠️ THE ⊖ AND THE ARRIVAL RING SIT ABOVE THE CARD'S OWN TOP EDGE, and a
      scroll view does not draw above its content's origin. Without a top
      padding the FIRST row's badge was sliced in half and its jade ring lost
      its top edge — on the one card everybody looks at first.

      The padding must be at least the largest overhang, and it must be
      CONSTANT: one that appeared with edit mode would push the whole column
      down under the finger that had just opened it.
    */
    const card = code('components/home/editable-widget.tsx');
    const overhangs = [...card.matchAll(/top: -(\d+)/g)].map((m) => Number(m[1]));
    expect(overhangs.length).toBeGreaterThan(0);

    const home = code('home/home-screen.tsx');
    const pad = home.match(/paddingTop: (\d+)/);
    expect(pad).not.toBeNull();
    expect(Number(pad![1])).toBeGreaterThanOrEqual(Math.max(...overhangs));
    // Constant — never keyed on the mode.
    expect(home).not.toMatch(/paddingTop: editing/);
  });

  it('keeps ＋ and Done in the header, outside the list', () => {
    const home = read('home/home-screen.tsx');
    const header = home.indexOf('<ScreenHeader');
    const list = home.indexOf('<DraggableFlatList');
    expect(header).toBeLessThan(list);
    expect(home.slice(header, list)).toContain("label: '＋'");
  });

  it('the hint replaces the WHOLE text block, in a box of the same height', () => {
    /*
      ⚠️ THE BUG: it replaced only the NAME, leaving the date above it and one
      13pt line for the sentence. On a 390pt iPhone — beside ＋, Done and the
      avatar — that is about 193pt of room for a 198pt string, so iOS read
      `Hold to move · tap ⊖ to remo…` while the wider Android emulator read it
      whole. A member on a small phone got a truncated instruction about a mode
      they had just entered.

      Two lines at 13/18 is 36pt, and the block it replaces is the date's 19
      plus a 2pt gap plus the name's 30 — so the column below does not move by
      a pixel when the mode opens, which is the rule this screen was rewritten
      three times to keep.
    */
    const header = code('components/amazen/screen-header.tsx');
    expect(header).toMatch(/hint \? \(\s*<View style=\{\{ height: 51/);
    expect(header).toMatch(/numberOfLines=\{2\}[^>]*fontSize: 13, lineHeight: 18/);
    // The date is inside the else branch — it is not drawn while a mode is open.
    const at = header.indexOf('hint ? (');
    expect(header.slice(at, header.indexOf(') : (', at))).not.toContain('{date}');
  });
});

describe('§5 — saved immediately, and nothing to confirm', () => {
  it('has no UNDO line, and no state left over from one', () => {
    /*
      §5 asks for `( Saved to your account.  UNDO )` for 30 seconds after every
      change. Built, shipped for a day, removed — the first person to see it
      asked what it was for, which is the answer.

      An undo earns its place where the action is hard to reverse, and none of
      these are: a move is one drag back, a remove is one tap in the gallery,
      an add is one tap on the ⊖. It appeared after EVERY change, so a
      rearrangement — which is a run of changes — kept it on screen the whole
      time, over the card below it. Its own words were also the only thing
      claiming the layout is on the account; it is on the phone.
    */
    expect(fs.existsSync(path.join(SRC, 'components/home/saved-line.tsx'))).toBe(false);
    const home = code('home/home-screen.tsx');
    expect(home).not.toMatch(/SavedLine|UNDO_MS|undoTo/);
    // And the before-picture the line needed is gone from the layout API too.
    expect(code('home/use-home-layout.ts')).not.toMatch(/snapshot|restore/);
  });

  it('❌ no confirm dialog and ❌ no save button', () => {
    const home = code('home/home-screen.tsx');
    expect(home).not.toMatch(/ConfirmSheet|Alert\.alert/);
    expect(home).not.toMatch(/home\.edit\.save\b/);
  });

  it('every change is written the instant it is made', () => {
    /*
      Done closes a MODE; it commits nothing. A member who backgrounds the app
      mid-arrangement keeps their arrangement, which is the half of §5 that
      actually mattered.
    */
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/layout\.setOrder\(/);
    expect(home).toMatch(/layout\.hide\(/);
    expect(home).toMatch(/layout\.add\(/);
    const hook = code('home/use-home-layout.ts');
    for (const fn of ['setOrder', 'hide', 'add', 'move']) {
      const at = hook.indexOf(`const ${fn} =`);
      expect(at).toBeGreaterThan(-1);
      expect(hook.slice(at, at + 900)).toContain('persist(');
    }
  });
});

describe('§3 — the three taps', () => {
  it('impactLight on entering, selection on crossing, impactMedium on the drop', () => {
    const home = code('home/home-screen.tsx');
    expect(code('home/use-home-editing.ts')).toMatch(/impact\('light'\)/);
    expect(home).toMatch(/onPlaceholderIndexChange=\{selection\}/);
    expect(home).toMatch(/impact\('medium'\)/);
  });

  it('never imports the native module at the top of a screen', () => {
    /*
      ⚠️ `expo-haptics` is NATIVE. A JS-only update that adds it reaches a
      binary without it, and an Expo module that is missing throws at IMPORT —
      which would take the whole home screen down rather than cost it a buzz.
    */
    expect(code('home/home-screen.tsx')).not.toMatch(/from 'expo-haptics'/);
    expect(code('lib/haptics.ts')).toMatch(/require\('expo-haptics'\)/);
  });
});

describe('the copy the design refuses', () => {
  it('never says "Your home screen is empty"', () => {
    const en = JSON.parse(read('i18n/locales/en.json'));
    const home = JSON.stringify(en.home ?? {});
    expect(home).not.toMatch(/Your home screen is empty/);
    expect(home).not.toMatch(/Add to your home/);
  });

  it('says what the design says', () => {
    const en = JSON.parse(read('i18n/locales/en.json'));
    expect(en.home.nothingYet.title).toBe('Nothing on your home yet.');
    expect(en.home.nothingYet.sub).toBe('Here is what you would be seeing right now.');
    expect(en.home.edit.hint).toBe('Hold to move · tap ⊖ to remove');
    expect(en.home.edit.remove).toBe('Take off my home');
  });

  it('draws no dashed "Add a widget" outline on the empty home', () => {
    expect(code('components/home/empty-home.tsx')).not.toMatch(/dashed/);
  });
});

describe('the render path — a column of live widgets, redrawn on every gesture', () => {
  const home = code('home/home-screen.tsx');
  const card = code('components/home/editable-widget.tsx');

  it('memoizes the card, and gives it callbacks that survive a render', () => {
    /*
      ⚠️ THE TWO HALVES ONLY WORK TOGETHER. `renderItem` runs for every card
      whenever the screen's state moves — entering edit mode, a ring expiring,
      a drag starting — and each card renders a whole live widget underneath
      it. `React.memo` alone buys nothing if the parent hands down a fresh
      `() => remove(item.key)` each time, which is why every callback takes the
      key and the parent passes ONE function per action.
    */
    expect(card).toMatch(/React\.memo\(EditableWidgetInner\)/);
    expect(card).toMatch(/onRemove: \(key: string\) => void;/);
    expect(card).toMatch(/onMove: \(key: string, direction: 'up' \| 'down'\) => void;/);
    expect(home).toMatch(/onRemove=\{removeWidget\}/);
    expect(home).toMatch(/onMove=\{moveBy\}/);
    expect(home).not.toMatch(/on(Remove|Move\w*)=\{\(\) =>/);
  });

  it('builds no props in the render path that could be built once', () => {
    // A fresh object identity per render re-runs the list's own diff for nothing.
    expect(home).not.toMatch(/containerStyle=\{\{/);
    expect(home).not.toMatch(/contentContainerStyle=\{\{/);
    expect(home).toMatch(/const renderDropSlot = \(\) => <DropSlot \/>;/);
  });

  it('spends no worklet on a value that is not animated', () => {
    /*
      `isActive` is an ordinary React prop, so `useAnimatedStyle` around it
      returned a constant and bought a worklet per card for nothing.
    */
    expect(card).not.toMatch(/useAnimatedStyle\(\(\) => \(\{ opacity: isActive/);
  });

  it('draws nothing until the saved order has landed', () => {
    /*
      The layout is read from the phone. Until it arrives the hook composes the
      DEFAULT order, so a member who had arranged their home watched it
      rearrange itself, and a member with an empty home saw the §1 empty state
      flash before their widgets appeared.
    */
    expect(home).toMatch(/layout\.loading \? EMPTY_ROWS : layout\.rows/);
    expect(code('home/registry.tsx')).toMatch(/EMPTY_ROWS: readonly WidgetRow\[\] = Object\.freeze/);
  });

  it('never leaves a timer holding a setter for a screen that is gone', () => {
    for (const f of ['home/home-screen.tsx', 'home/use-home-editing.ts']) {
      const src = code(f);
      if (!/setTimeout\(/.test(src)) continue;
      expect(src).toMatch(/clearTimeout\(/);
      expect(src).toMatch(/useEffect\(\(\) => \(\) =>/);
    }
  });
});

describe('a widget the member is entitled to is always reachable', () => {
  it('the gallery offers everything available that is not on the home', () => {
    /*
      ⚠️ THE BUG THIS EXISTS FOR: `offScreen` asked only for the HIDDEN set, so
      a registry row that is not in `DEFAULT_ORDER` — never in the saved order,
      never hidden — was in neither list. Entitled to it, not on the home, not
      in the gallery: registered and unreachable, with nothing on screen to say
      so.
    */
    const hook = code('home/use-home-layout.ts');
    expect(hook).toMatch(/available\.filter\(\(w\) => !onHomeKeys\.has\(w\.key\)\)/);
    expect(hook).not.toMatch(/available\.filter\(\(w\) => layout\.hidden\.includes/);
  });
});

describe('one rule, one place', () => {
  const HOME_FILES = [
    'home/home-screen.tsx',
    'home/use-home-layout.ts',
    'home/use-home-editing.ts',
    'home/answers.ts',
    'components/home/editable-widget.tsx',
    'components/home/empty-home.tsx',
    'components/home/widget-gallery.tsx',
  ];

  it('nobody but the registry knows how to render a widget\'s name', () => {
    /*
      `t(row.title, { defaultValue: row.key })` was written in four files, and
      the fallback is the interesting half: a row whose i18n key has no
      translation must render its KEY, not the dotted path, because a dotted
      path on somebody's home screen looks like a crash.
    */
    for (const f of HOME_FILES) expect(code(f)).not.toMatch(/t\(row\.title/);
    expect(code('home/registry.tsx')).toMatch(/export function widgetTitle\(/);
  });

  it('the gallery measures the window as it is now, not as it was', () => {
    /*
      `Dimensions.get` is read once and never again, so a rotation — or an iPad
      split view — leaves every page the width of the old orientation and the
      paging stops landing on a card.
    */
    const gallery = code('components/home/widget-gallery.tsx');
    expect(gallery).toMatch(/useWindowDimensions\(\)/);
    expect(gallery).not.toMatch(/Dimensions\.get/);
    // And one snapping rule, not two that disagree about how wide a page is.
    expect(gallery).not.toMatch(/pagingEnabled/);
    expect(gallery).toMatch(/snapToInterval=\{stride\}/);
  });
});

describe('an empty column always offers the way out', () => {
  const home = code('home/home-screen.tsx');

  it('§1 is shown only when there is something to preview', () => {
    /*
      ⚠️ THE DEAD SCREEN THIS EXISTS FOR. §1's empty home is built around two
      real cards at .42 and a Keep pill — "here is what you would be seeing
      right now" — and with nothing to suggest that sentence sat over blank
      space above no control at all. That is what a member got on every launch
      while the registry was being rebuilt: nowhere to go, and a promise of a
      preview that was not there.

      The question is not "is the member editing", it is "is there anything to
      suggest".
    */
    expect(home).toMatch(/suggestions\.length > 0 && !editing \? \(\s*<EmptyHome/);
    expect(home).toMatch(/\) : \(\s*<EmptyArrange/);
  });

  it('the fallback always names a way forward', () => {
    /*
      The mark, what the member has, and the button that opens the gallery. Its
      ONLY silent case is a member with nothing available at all — where the
      button would open an empty sheet, and saying so is the honest answer.
    */
    const arrange = code('components/home/empty-arrange.tsx');
    expect(arrange).toMatch(/totalAvailable > 0 \? \(/);
    expect(arrange).toMatch(/home\.edit\.add/);
    expect(arrange).toMatch(/home\.edit\.emptyNone/);
  });

  it('one screen, and one word follows the mode', () => {
    /*
      "Nothing to arrange yet" is true of somebody mid-arrangement and odd on a
      resting home; "Nothing on your home yet" is the reverse. Everything else
      is the same answer to the same question, so it is one component rather
      than two that drift.
    */
    const arrange = code('components/home/empty-arrange.tsx');
    expect(arrange).toContain("home.edit.emptyTitle");
    expect(arrange).toContain("home.nothingYet.title");
    expect(arrange).toMatch(/arranging/);
    expect(home).toMatch(/arranging=\{editing\}/);
  });

  it('wears the drop slot, and §1 must not', () => {
    /*
      ⚠️ §1 FORBIDS A DASHED OUTLINE AND IS RIGHT ABOUT ITS OWN SCREEN — where
      two real cards are on offer, a dashed box would say something is missing,
      and nothing is. Here the column IS a slot waiting for a card, and the
      dashed rectangle is already this screen's word for that: it is the drop
      target, drawn at its own weight rather than invented again.
    */
    const arrange = code('components/home/empty-arrange.tsx');
    const card = code('components/home/editable-widget.tsx');
    expect(code('components/home/empty-home.tsx')).not.toMatch(/dashed/);
    for (const src of [arrange, card]) {
      expect(src).toMatch(/borderStyle: 'dashed'/);
      expect(src).toMatch(/borderWidth: 1\.5/);
      expect(src).toMatch(/opacity: 0\.45/);
    }
  });

  it('says nothing was lost, and only when something was', () => {
    // `hidden` is not `deleted`, and this is the one moment worth saying so.
    expect(code('components/home/empty-arrange.tsx')).toMatch(/\{emptied \? \(/);
    expect(home).toMatch(/emptied=\{layout\.offScreen\.length > 0 && editing\}/);
    const en = JSON.parse(read('i18n/locales/en.json'));
    expect(en.home.edit.emptied).toBe(
      'You removed all of them. They are still yours — nothing was lost.',
    );
  });

  it('counts in every language with `count`, never an arbitrary `n`', () => {
    expect(code('components/home/empty-arrange.tsx')).toMatch(/count: totalAvailable/);
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const l = JSON.parse(read(`i18n/locales/${lang}.json`));
      for (const k of ['emptySub_one', 'emptySub_other', 'emptyTitle', 'emptyNone', 'emptied']) {
        expect(typeof l.home.edit[k]).toBe('string');
      }
    }
  });
});
