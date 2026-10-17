import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import Reanimated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { widgetTitle, type WidgetRow } from '../../home/registry';
import { type Pitch } from '../../home/pitch';
import { selection } from '../../lib/haptics';
import { useAuth } from '../../contexts/auth-context';
import { holds } from '../../lib/permissions';

/** WidgetGallery's state and handlers — everything before its markup, moved here unchanged. */
export function useWidgetGallery({
  visible,
  onClose,
  rows,
  onHome,
  onAdd,
  onUndo,
  hasData,
}: Pick<{
  visible: boolean;
  /** Done, or the sheet dismissed — with what was added this visit, in order. */
  onClose: (added: string[]) => void;
  /** Everything available to this member, on their home or not. */
  rows: WidgetRow[];
  /** Keys already on the home — shown, greyed, never offered again. */
  onHome: Set<string>;
  /** Added — the gallery STAYS OPEN so several can be added in one visit. `after` keeps them in the order chosen. */
  onAdd: (key: string, after: string | null) => void;
  /** Tapped "Added" again: take it back off before finishing. */
  onUndo: (key: string) => void;
  hasData: (row: WidgetRow) => boolean;
}, 'visible' | 'onClose' | 'rows' | 'onHome' | 'onAdd' | 'onUndo' | 'hasData'>) {
  const { amazen, colors } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { width } = useWindowDimensions();
  const gutter = amazen.space(4);
  const inner = width - gutter * 2;
  /* A page is the whole sheet width; the gutter is inside it. */
  const stride = width;

  /*
    ⚠️ FROZEN WHEN THE GALLERY OPENS. Adding one here puts it on the home at
    once, and sorting against the live set would move the page from under the
    member's finger. What was ALREADY there is greyed; what they add now is
    ticked and stays where it is.
  */
  const [before, setBefore] = useState<Set<string>>(onHome);
  const [addedNow, setAddedNow] = useState<string[]>([]);
  useEffect(() => {
    if (visible) {
      setBefore(new Set(onHome));
      setAddedNow([]);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => onClose(addedNow);
  const toggle = (key: string) => {
    selection();
    if (addedNow.includes(key)) {
      onUndo(key);
      setAddedNow((a) => a.filter((k) => k !== key));
    } else {
      onAdd(key, addedNow[addedNow.length - 1] ?? null);
      setAddedNow((a) => [...a, key]);
    }
  };

  const [pitches, setPitches] = useState<Record<string, Pitch>>({});
  const hear = useCallback((key: string) => (p: Pitch) => {
    setPitches((m) => (m[key]?.line === p.line && m[key]?.need === p.need ? m : { ...m, [key]: p }));
  }, []);
  const hearers = useMemo(() => Object.fromEntries(rows.map((r) => [r.key, hear(r.key)])), [rows, hear]);

  /* Not on the home first — most waiting first — then the rest in registry order; added ones last. */
  const shown = useMemo(() => {
    const list = rows.filter((r) => before.has(r.key) || hasData(r));
    const pos = new Map(rows.map((r, i) => [r.key, i]));
    return [...list].sort((a, b) =>
      Number(before.has(a.key)) - Number(before.has(b.key))
      || (pitches[b.key]?.need ?? 0) - (pitches[a.key]?.need ?? 0)
      || pos.get(a.key)! - pos.get(b.key)!);
  }, [rows, before, hasData, pitches]);

  /* The page follows the WIDGET, not the index — suggestions arriving may reorder the pages. */
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  useEffect(() => { if (visible) setCurrentKey(null); }, [visible]);
  const index = Math.max(0, currentKey ? shown.findIndex((r) => r.key === currentKey) : 0);
  const current = shown[index];

  /*
    ⭐ ONE PROGRESS VALUE — the pages' scroll, in pages. The highlight under the
    names, the dots and the Add button all read it on the UI thread, so they
    move WITH the finger instead of jumping when the swipe settles.
  */
  const progress = useSharedValue(0);
  const pages = useRef<Reanimated.ScrollView>(null);
  const names = useRef<ScrollView>(null);
  const keys = useMemo(() => shown.map((r) => r.key), [shown]);
  const settle = useCallback((i: number) => {
    const key = keys[i];
    if (key && key !== currentKeyRef.current) { selection(); setCurrentKey(key); }
  }, [keys]);
  const currentKeyRef = useRef<string | null>(null);
  currentKeyRef.current = current?.key ?? null;
  const onScroll = useAnimatedScrollHandler((e) => { progress.value = e.contentOffset.x / stride; });
  // The label changes at the half-way point of a swipe — where the button is dimmest.
  useAnimatedReaction(() => Math.round(progress.value), (i, prev) => { if (i !== prev) runOnJS(settle)(i); }, [settle]);
  /*
    Only when the ORDER changes (a reason arrived and re-sorted the pages) is
    the page moved by hand, to stay on the same widget. Never on a swipe —
    the swipe already put it there, and a jump mid-swipe is the jerk.
  */
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    pages.current?.scrollTo({ x: indexRef.current * stride, animated: false });
    progress.value = indexRef.current;
  }, [keys, stride, progress]);
  const jump = (key: string) => {
    const i = shown.findIndex((r) => r.key === key);
    pages.current?.scrollTo({ x: i * stride, animated: true });
  };

  /* Where each name sits in its row — the highlight slides between them. */
  const [chips, setChips] = useState<Record<string, { x: number; w: number }>>({});
  const xs = useSharedValue<number[]>([]);
  const ws = useSharedValue<number[]>([]);
  useEffect(() => {
    xs.value = keys.map((k) => chips[k]?.x ?? 0);
    ws.value = keys.map((k) => chips[k]?.w ?? 0);
  }, [chips, keys, xs, ws]);
  const highlight = useAnimatedStyle(() => {
    const n = xs.value.length;
    if (!n) return { opacity: 0 };
    const p = Math.max(0, Math.min(n - 1, progress.value));
    const i = Math.floor(p); const j = Math.min(n - 1, i + 1); const f = p - i;
    return {
      opacity: ws.value[i] ? 1 : 0,
      transform: [{ translateX: xs.value[i]! + (xs.value[j]! - xs.value[i]!) * f }],
      width: ws.value[i]! + (ws.value[j]! - ws.value[i]!) * f,
    };
  });
  /* Keep the current name in view. */
  useEffect(() => {
    const at = current ? chips[current.key] : undefined;
    if (at) names.current?.scrollTo({ x: Math.max(0, at.x - gutter * 2), animated: true });
  }, [current, chips, gutter]);

  /* The button dims through the middle of a swipe, and is whole again on each page. */
  const buttonStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - Math.round(progress.value)); // 0 … 0.5
    return { opacity: 1 - d * 1.3, transform: [{ scale: 1 - d * 0.06 }] };
  });

  /*
    ⭐ THE SUBTITLE NAMES WHAT HELPS, AND FITS THE PERSON. "2 could help you"
    made the member go and find which two. It names them instead — the ones
    with something waiting for THIS member — and when nothing is waiting it
    says what the gallery is for: running a team, or a working day.
  */
  const helping = shown.filter((r) => !before.has(r.key) && (pitches[r.key]?.need ?? 0) > 0).map((r) => widgetTitle(r, t));
  const suggested = helping.length;
  const { user } = useAuth();
  const leads = holds(user as never, 'canViewSpaceAttendance') || holds(user as never, 'canViewAllTasks');
  const subtitle = helping.length === 1
    ? t('home.gallery.hasOne', { a: helping[0] })
    : helping.length === 2
      ? t('home.gallery.hasTwo', { a: helping[0], b: helping[1] })
      : helping.length > 2
        ? t('home.gallery.hasMany', { a: helping[0], b: helping[1], count: helping.length - 2 })
        : t(leads ? 'home.gallery.forTeam' : 'home.gallery.forDay');
  const offered = shown.filter((r) => !before.has(r.key)).length;

  return {
    amazen,
    colors,
    t,
    c,
    width,
    gutter,
    inner,
    stride,
    before,
    addedNow,
    close,
    toggle,
    pitches,
    hearers,
    shown,
    current,
    progress,
    pages,
    names,
    onScroll,
    jump,
    setChips,
    highlight,
    buttonStyle,
    suggested,
    subtitle,
    offered,
  };
}
