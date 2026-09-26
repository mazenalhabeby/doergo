import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Reanimated, {
  interpolateColor, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, PrimaryButton } from '../amazen';
import { widgetTitle, type WidgetRow } from '../../home/registry';
import { PitchProvider, type Pitch } from '../../home/pitch';
import { selection } from '../../lib/haptics';
import { useAuth } from '../../contexts/auth-context';
import { holds } from '../../lib/permissions';

/** The preview is the real card at this scale, so a whole card fits a page. */
const SCALE = 0.78;
const FRAME_H = 300;

/**
 * ⭐ THE GALLERY — every widget the member can have, one per page.
 *
 * ⚠️ THE PREVIEW IS THE REAL COMPONENT WITH REAL DATA, NEVER A SCREENSHOT. It
 * is scaled to fit the page (it used to spill off the side) and faded at the
 * foot; the same `<CrewCard/>` the home renders, so the two never drift.
 *
 * ⭐ EACH PAGE SAYS WHY IT WOULD HELP YOU NOW. The card reports its own reason
 * (home/pitch.tsx) from what it already fetched — "4 people need you right
 * now" — and the widgets with the most waiting come first. The names are all
 * visible at the top; a dot marks a suggestion; added ones stay, greyed.
 *
 * ⚠️ A WIDGET WHOSE DATA HAS NOT ARRIVED IS NOT OFFERED YET.
 */
export function WidgetGallery({
  visible,
  onClose,
  rows,
  onHome,
  onAdd,
  onUndo,
  hasData,
}: {
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
}) {
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
  useEffect(() => { if (visible) { setBefore(new Set(onHome)); setAddedNow([]); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
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

  return (
    <BlurSheet visible={visible} onClose={close}>
      <SheetPanel onClose={close} maxHeightFraction={0.92} style={{ paddingHorizontal: 0, paddingTop: 10 }}>
        <View style={{ paddingHorizontal: gutter }}>
          <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>
            {t('home.gallery.addTitle', { defaultValue: 'Add a widget' })}
          </AText>
          <AText variant="caption" tone="muted" style={{ marginTop: 3 }}>
            {suggested || offered ? subtitle : t('home.gallery.none', { defaultValue: 'Nothing left to add.' })}
          </AText>
        </View>

        {/* Every name at once — a dot for a suggestion, grey for one already on the home. */}
        <ScrollView ref={names} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 6, paddingTop: amazen.space(3.5) }}>
          <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: amazen.space(3.5), bottom: 0, borderRadius: 999, backgroundColor: c.accentTint, borderWidth: 1, borderColor: c.accent }, highlight]} />
          {shown.map((r) => {
            const on = r.key === current?.key;
            const added = before.has(r.key);
            const dot = !added && (pitches[r.key]?.need ?? 0) > 0;
            return (
              <Pressable
                key={r.key}
                onPress={() => jump(r.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onLayout={(e) => {
                  const { x, width: w } = e.nativeEvent.layout;
                  setChips((m) => (m[r.key]?.x === x && m[r.key]?.w === w ? m : { ...m, [r.key]: { x, w } }));
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                  borderWidth: 1, borderColor: c.lineGlass,
                }}
              >
                {addedNow.includes(r.key)
                  ? <AText variant="caption" tone="accent" style={{ fontSize: 12 }}>✓</AText>
                  : dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.warn }} /> : null}
                <AText variant="caption" style={{ fontSize: 12.5, color: on ? c.inkStrong : added ? c.inkMuted : c.ink }}>{widgetTitle(r, t)}</AText>
              </Pressable>
            );
          })}
        </ScrollView>

        <Reanimated.ScrollView
          ref={pages}
          horizontal
          onScroll={onScroll}
          scrollEventThrottle={16}
          /* ⚠️ Not `pagingEnabled` — `snapToInterval` knows how wide a page is (home-screen-spec). */
          snapToInterval={stride}
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: amazen.space(3) }}
        >
          {shown.map((row) => {
            const r = row;
            const p = pitches[r.key];
            const added = before.has(r.key);
            const urgent = !added && (p?.need ?? 0) > 0;
            return (
              <View key={r.key} style={{ width, paddingHorizontal: gutter, gap: amazen.space(3) }}>
                {/* Why, in one line — amber when something is waiting on you, grey when it is calm. */}
                <View style={{
                  flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
                  backgroundColor: urgent ? c.warnTint : c.tile, borderWidth: 1, borderColor: urgent ? `${c.warn}40` : c.lineGlass,
                }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: urgent ? c.warn : c.inkMuted }} />
                  <AText variant="caption" style={{ flex: 1, fontSize: 13, lineHeight: 18, color: urgent ? c.inkStrong : c.ink }}>
                    {added ? t('home.gallery.onHomeLine', { defaultValue: 'Already on your home screen.' }) : p?.line ?? (r.question ? t(r.question) : '')}
                  </AText>
                </View>

                {/*
                  ⚠️ `pointerEvents: none` — it is the widget, but it is not
                  being used. A live card here takes a tap meant for Add.
                */}
                <View pointerEvents="none" style={{ height: FRAME_H, overflow: 'hidden', borderRadius: 22, backgroundColor: c.well, opacity: added ? 0.55 : 1 }}>
                  <View style={{ width: inner / SCALE, transform: [{ scale: SCALE }], transformOrigin: 'top left' }}>
                    <PitchProvider onPitch={hearers[r.key]!}>
                      <row.Component />
                    </PitchProvider>
                  </View>
                  <LinearGradient colors={[`${colors.card}00`, colors.card]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 }} />
                </View>

                <View>
                  <AText variant="body" tone="strong" style={{ fontSize: 17, fontFamily: amazen.font.sansMedium }}>{widgetTitle(r, t)}</AText>
                  {r.question ? <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>{t(r.question)}</AText> : null}
                </View>
              </View>
            );
          })}
        </Reanimated.ScrollView>

        {/* The same place on every page: where you are, and Add. */}
        <View style={{ paddingHorizontal: gutter, paddingTop: amazen.space(3.5), gap: amazen.space(3) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            {shown.map((r, i) => <Dot key={r.key} i={i} progress={progress} on={c.accent} off={c.lineGlass} />)}
          </View>
          {current ? (
            <Reanimated.View style={[{ flexDirection: 'row', gap: amazen.space(2.5) }, buttonStyle]}>
              {before.has(current.key) ? (
                <PrimaryButton label={t('home.gallery.isOnHome', { name: widgetTitle(current, t) })} disabled style={{ flex: 1 }} />
              ) : addedNow.includes(current.key) ? (
                /* Added — the same button, now a tick; tap again to take it back. */
                <Pressable
                  onPress={() => toggle(current.key)}
                  accessibilityRole="button"
                  accessibilityHint={t('home.gallery.undoHint', { defaultValue: 'Tap to take it off again' })}
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: 999, paddingVertical: amazen.space(3.5), alignItems: 'center', justifyContent: 'center',
                    backgroundColor: c.accentTint, borderWidth: 1, borderColor: c.accent, opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <AText variant="body" tone="accent" style={{ fontFamily: amazen.font.sansMedium }}>
                    {`✓  ${t('home.gallery.added', { defaultValue: 'Added' })}`}
                  </AText>
                </Pressable>
              ) : (
                <PrimaryButton label={t('home.gallery.addName', { name: widgetTitle(current, t) })} onPress={() => toggle(current.key)} style={{ flex: 1 }} />
              )}
              {addedNow.length ? (
                <Pressable
                  onPress={close}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    borderRadius: 999, paddingHorizontal: amazen.space(5), alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: c.lineGlass, opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium }}>{t('home.gallery.done', { count: addedNow.length })}</AText>
                </Pressable>
              ) : null}
            </Reanimated.View>
          ) : null}
        </View>
      </SheetPanel>
    </BlurSheet>
  );
}

/** A page dot that grows as its page arrives, following the finger. */
function Dot({ i, progress, on, off }: { i: number; progress: SharedValue<number>; on: string; off: string }) {
  const style = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(progress.value - i));
    return { width: 6 + 12 * near, backgroundColor: interpolateColor(near, [0, 1], [off, on]) };
  });
  return <Reanimated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}
