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

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
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

  it('the gallery renders the component at full size, inert', () => {
    const gallery = code('components/home/widget-gallery.tsx');
    expect(gallery).toMatch(/<row\.Component \/>/);
    expect(gallery).toMatch(/pointerEvents="none"/);
    expect(gallery).not.toMatch(/Image|require\(/);
  });
});

describe('rule 4 — two suggestions, and only ones whose data arrived', () => {
  it('takes two, never more', () => {
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/layout\.offScreen\.slice\(0, 2\)/);
    expect(code('components/home/empty-home.tsx')).toMatch(/\.slice\(0, 2\)/);
  });

  it('drops a suggestion with no live answer rather than showing "loading"', () => {
    expect(code('components/home/empty-home.tsx')).toMatch(/s\.line !== null/);
  });

  it('the documents answer waits for the fetch to land, not for a zero', () => {
    /*
      ⚠️ `total === 0` cannot answer "has it arrived" — it is also what a member
      with nothing outstanding looks like. Offering them a card because it is
      still loading, and refusing them one because they are up to date, are two
      different mistakes with the same symptom.
    */
    expect(code('contexts/document-requirements-context.tsx')).toMatch(/ready: boolean;/);
    expect(code('home/home-screen.tsx')).toMatch(/if \(!docs\.ready\) return null;/);
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

describe('rule 6 — new widgets land at the bottom, always', () => {
  it('the gallery appends rather than restoring the old place', () => {
    const hook = code('home/use-home-layout.ts');
    expect(hook).toMatch(/keys: \[\.\.\.orderedKeys\.filter\(\(k\) => k !== key\), key\]/);
    expect(code('home/home-screen.tsx')).toMatch(/layout\.add\(key\)/);
  });

  it('closes the sheet so the arrival is visible, and rings it', () => {
    const home = code('home/home-screen.tsx');
    expect(home).toMatch(/setPicking\(false\);\s*\n\s*setLanded\(key\)/);
    expect(code('components/home/editable-widget.tsx')).toMatch(
      /export const LANDED_MS = 30_000;/,
    );
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
    const hook = code('home/use-home-layout.ts');
    const set = hook.slice(hook.indexOf('const setOrder ='));
    expect(set.slice(0, 500)).toMatch(/const visible = new Set\(rows\.map\(\(r\) => r\.key\)\)/);
    expect(set.slice(0, 500)).toMatch(/visible\.has\(k\) \? visibleKeys\[i\+\+\]/);
  });
});

describe('rule 9 — glass on three cards only', () => {
  it('names exactly the three, and nothing else', () => {
    const registry = code('home/registry.tsx');
    const rows = [...registry.matchAll(/key: '([^']+)',[\s\S]*?surface: '(glass|well)'/g)]
      .map((m) => ({ key: m[1], surface: m[2] }));
    const glass = rows.filter((r) => r.surface === 'glass').map((r) => r.key).sort();
    // `clients` is not registered yet — it has no component, per rule 11.
    expect(glass).toEqual(['crew', 'shift-clock']);
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

  it('every row has a component and a surface', () => {
    const keys = [...registry.matchAll(/^    key: '([^']+)',$/gm)].map((m) => m[1]);
    const surfaces = [...registry.matchAll(/^    surface: '(glass|well)',$/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(3);
    expect(surfaces.length).toBe(keys.length);
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
    const pad = home.match(/contentContainerStyle=\{\{[\s\S]*?paddingTop: (\d+)/);
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

  it('the hint replaces the name in a box of the same height', () => {
    expect(code('components/amazen/screen-header.tsx')).toMatch(
      /hint \? \(\s*<View style=\{\{ height: 30/,
    );
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
    expect(home).toMatch(/impact\('light'\)/);
    expect(home).toMatch(/onPlaceholderIndexChange=\{\(\) => selection\(\)\}/);
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
