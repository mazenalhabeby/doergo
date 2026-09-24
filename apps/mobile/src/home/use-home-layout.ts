import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { availableWidgets, DEFAULT_ORDER, type WidgetRow } from './registry';
import { loadLayout, saveLayout, EMPTY_LAYOUT, type HomeLayout } from './layout-store';
import { move as moveInList, type Moved } from './arrange-list';

/**
 * The member's home screen: what is on it, in what order, and how to change it.
 *
 * ⚠️ THE LAYOUT SHOULD BE A SERVER-SIDE RECORD AND IS NOT ONE YET.
 * `home-screen.md` §3 is explicit — "The layout is a server-side record, not
 * AsyncStorage" — and so is the default order, which it says is "composed
 * server-side" per profile. Neither endpoint exists, and building one is a
 * backend change that has not been asked for. This keeps the phone's own copy
 * and `DEFAULT_ORDER`; the shape of `HomeLayout` is already what a record
 * would carry, so the swap is the store and nothing above it.
 *
 * ⚠️ RESOLUTION ORDER IS FIXED AND ENTITLEMENT IS LAST:
 *
 *     registry → default order → the member's saved order + hidden set
 *              → filter by entitlement            ← LAST, every render
 *
 * Filtering last is what makes a key the member is no longer allowed simply
 * not appear, rather than error or be deleted. Filtering earlier would bake
 * today's permissions into the saved arrangement.
 */
export interface HomeLayoutApi {
  /** What actually renders, in order. */
  rows: WidgetRow[];
  /** Everything this person COULD have — feeds the picker. */
  available: WidgetRow[];
  /** Available, but switched off. What the picker offers. */
  offScreen: WidgetRow[];
  loading: boolean;
  /**
   * Swap a visible widget with its visible neighbour, and say what happened.
   *
   * ⚠️ ARROWS, NOT A DESTINATION INDEX. The screen has no drag canvas to
   * produce one, and an index is the wrong contract for a control that can only
   * ever mean "one place that way".
   */
  move: (key: string, direction: 'up' | 'down') => Moved | null;
  /**
   * The drag landed. Commit the VISIBLE order the member just produced.
   *
   * ⚠️ THE VISIBLE ORDER, WRITTEN BACK INTO THE SLOTS IT ALREADY OCCUPIED.
   * The stored list also holds keys the member cannot see — switched off, and
   * ones entitlement removed since — and those keep their places, so switching
   * one back on returns it where it was rather than to the bottom.
   */
  setOrder: (visibleKeys: string[]) => void;
  hide: (key: string) => void;
  show: (key: string) => void;
  /**
   * Added from the gallery.
   *
   * ⚠️ NEW WIDGETS LAND AT THE BOTTOM, ALWAYS — §6 rule 6, and it overrides
   * `show`'s "back where it was". The sheet closes so the arrival is visible,
   * and a card that reappears three rows up, off screen, has not arrived
   * anywhere the member can see. The bottom is the one place they are already
   * looking after a sheet slides away.
   */
  add: (key: string) => void;
  reset: () => void;
}

export function useHomeLayout(): HomeLayoutApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [layout, setLayout] = useState<HomeLayout>(EMPTY_LAYOUT);
  const [loading, setLoading] = useState(true);

  /*
    Which member this layout belongs to. Checked when the read lands, because
    somebody can sign out and in while it is in the air — and a home screen
    arranged by the previous person is a strange thing to be handed.
  */
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    loadedFor.current = userId;
    if (!userId) { setLayout(EMPTY_LAYOUT); setLoading(false); return; }
    setLoading(true);
    void loadLayout(userId).then((l) => {
      if (loadedFor.current !== userId) return;
      setLayout(l);
      setLoading(false);
    });
  }, [userId]);

  const persist = useCallback((next: HomeLayout) => {
    setLayout(next);
    if (userId) void saveLayout(userId, next);
  }, [userId]);

  const available = useMemo(() => availableWidgets(user), [user]);

  /*
    The saved order, then anything the registry has gained since — at the END,
    where a new widget cannot displace something the member arranged.
  */
  const orderedKeys = useMemo(() => {
    const known = new Set(available.map((w) => w.key));
    const saved = layout.keys.length ? layout.keys : DEFAULT_ORDER;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of saved) { if (!seen.has(k)) { seen.add(k); out.push(k); } }
    for (const k of DEFAULT_ORDER) { if (!seen.has(k) && known.has(k)) { seen.add(k); out.push(k); } }
    return out;
  }, [layout.keys, available]);

  const rows = useMemo(() => {
    const byKey = new Map(available.map((w) => [w.key, w]));
    return orderedKeys
      .filter((k) => !layout.hidden.includes(k))
      .map((k) => byKey.get(k))
      .filter((w): w is WidgetRow => !!w);
  }, [orderedKeys, layout.hidden, available]);

  const offScreen = useMemo(
    () => available.filter((w) => layout.hidden.includes(w.key)),
    [available, layout.hidden],
  );

  /**
   * Move a VISIBLE widget to a visible position.
   *
   * ⚠️ The drag reorders what the member can see; the saved list also holds
   * keys they cannot — hidden ones, and ones entitlement removed. Those keep
   * their places: the visible keys are written back into the slots they
   * already occupied, so nothing invisible is shuffled by a gesture about
   * something else.
   */
  const move = useCallback((key: string, direction: 'up' | 'down'): Moved | null => {
    /*
      ⚠️ THE LIST THE MEMBER SEES, NOT THE LIST THAT IS STORED.

      `orderedKeys` holds every key they have ever had; `rows` is what survived
      entitlement, which is asked LAST and every render. Moving against the
      stored list picks the wrong neighbour whenever an unentitled key sits
      between two visible ones, and reports the wrong former position — the
      third row said "WAS 4" because a widget nobody can see was counted above
      it.

      So: hide everything that is not on screen for the purposes of the swap.
      `move` then writes the visible keys back into the slots they already
      occupied, and the invisible ones keep their places.
    */
    const visible = new Set(rows.map((r) => r.key));
    const result = moveInList(
      { keys: orderedKeys, hidden: orderedKeys.filter((k) => !visible.has(k)) },
      key,
      direction,
    );
    if (!result.moved) return null;
    /*
      ⚠️ SAVED IMMEDIATELY. The line that follows is an UNDO, not a confirm —
      a member who moved a widget has already decided, and asking them to
      confirm it turns one tap into two for the commonest action on the screen.
    */
    persist({ ...layout, keys: result.layout.keys });
    return result.moved;
  }, [rows, orderedKeys, layout, persist]);

  /**
   * ⚠️ THE SAME ARITHMETIC AS `move`, FOR THE SAME REASON.
   *
   * `orderedKeys` holds every key the member has ever had; `rows` is what
   * survived entitlement, which is asked LAST and every render. Writing the
   * dragged order straight over the stored list would drop every key that was
   * filtered out of view — a member who is temporarily off a workspace would
   * lose that widget's saved position by rearranging an unrelated one.
   */
  const setOrder = useCallback((visibleKeys: string[]) => {
    const visible = new Set(rows.map((r) => r.key));
    let i = 0;
    const keys = orderedKeys.map((k) => (visible.has(k) ? visibleKeys[i++] ?? k : k));
    persist({ ...layout, keys });
  }, [rows, orderedKeys, layout, persist]);

  const hide = useCallback((key: string) => {
    if (layout.hidden.includes(key)) return;
    persist({ keys: orderedKeys, hidden: [...layout.hidden, key] });
  }, [layout, orderedKeys, persist]);

  const add = useCallback((key: string) => {
    persist({
      keys: [...orderedKeys.filter((k) => k !== key), key],
      hidden: layout.hidden.filter((k) => k !== key),
    });
  }, [layout.hidden, orderedKeys, persist]);

  const show = useCallback((key: string) => {
    persist({ keys: orderedKeys, hidden: layout.hidden.filter((k) => k !== key) });
  }, [layout.hidden, orderedKeys, persist]);

  const reset = useCallback(() => persist(EMPTY_LAYOUT), [persist]);

  return { rows, available, offScreen, loading, move, setOrder, hide, show, add, reset };
}
