import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { availableWidgets, DEFAULT_ORDER, type WidgetRow } from './registry';
import { loadLayout, saveLayout, EMPTY_LAYOUT, type HomeLayout } from './layout-store';

/**
 * The member's home screen: what is on it, in what order, and how to change it.
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
  move: (key: string, toIndex: number) => void;
  hide: (key: string) => void;
  show: (key: string) => void;
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
  const move = useCallback((key: string, toIndex: number) => {
    const visible = rows.map((w) => w.key);
    const from = visible.indexOf(key);
    if (from === -1 || from === toIndex) return;
    const reordered = [...visible];
    reordered.splice(from, 1);
    reordered.splice(Math.max(0, Math.min(toIndex, reordered.length)), 0, key);

    let i = 0;
    const keys = orderedKeys.map((k) => (visible.includes(k) ? reordered[i++]! : k));
    persist({ ...layout, keys });
  }, [rows, orderedKeys, layout, persist]);

  const hide = useCallback((key: string) => {
    if (layout.hidden.includes(key)) return;
    persist({ keys: orderedKeys, hidden: [...layout.hidden, key] });
  }, [layout, orderedKeys, persist]);

  const show = useCallback((key: string) => {
    persist({ keys: orderedKeys, hidden: layout.hidden.filter((k) => k !== key) });
  }, [layout.hidden, orderedKeys, persist]);

  const reset = useCallback(() => persist(EMPTY_LAYOUT), [persist]);

  return { rows, available, offScreen, loading, move, hide, show, reset };
}
