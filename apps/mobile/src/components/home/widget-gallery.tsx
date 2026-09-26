import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, PrimaryButton } from '../amazen';
import { widgetTitle, type WidgetRow } from '../../home/registry';
import { PitchProvider, type Pitch } from '../../home/pitch';
import { selection } from '../../lib/haptics';

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
  hasData,
}: {
  visible: boolean;
  onClose: () => void;
  /** Everything available to this member, on their home or not. */
  rows: WidgetRow[];
  /** Keys already on the home — shown, greyed, never offered again. */
  onHome: Set<string>;
  onAdd: (key: string) => void;
  hasData: (row: WidgetRow) => boolean;
}) {
  const { amazen, colors } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { width } = useWindowDimensions();
  const gutter = amazen.space(4);
  const inner = width - gutter * 2;

  const [pitches, setPitches] = useState<Record<string, Pitch>>({});
  const hear = useCallback((key: string) => (p: Pitch) => {
    setPitches((m) => (m[key]?.line === p.line && m[key]?.need === p.need ? m : { ...m, [key]: p }));
  }, []);
  const hearers = useMemo(() => Object.fromEntries(rows.map((r) => [r.key, hear(r.key)])), [rows, hear]);

  /* Not on the home first — most waiting first — then the rest in registry order; added ones last. */
  const shown = useMemo(() => {
    const list = rows.filter((r) => onHome.has(r.key) || hasData(r));
    const pos = new Map(rows.map((r, i) => [r.key, i]));
    return [...list].sort((a, b) =>
      Number(onHome.has(a.key)) - Number(onHome.has(b.key))
      || (pitches[b.key]?.need ?? 0) - (pitches[a.key]?.need ?? 0)
      || pos.get(a.key)! - pos.get(b.key)!);
  }, [rows, onHome, hasData, pitches]);

  /* The page follows the WIDGET, not the index — suggestions arriving may reorder the pages. */
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  useEffect(() => { if (visible) setCurrentKey(null); }, [visible]);
  const index = Math.max(0, currentKey ? shown.findIndex((r) => r.key === currentKey) : 0);
  const current = shown[index];

  const pages = useRef<ScrollView>(null);
  const names = useRef<ScrollView>(null);
  useEffect(() => { pages.current?.scrollTo({ x: index * width, animated: false }); }, [index, width]);
  const onPaged = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (shown[i] && shown[i]!.key !== current?.key) { selection(); setCurrentKey(shown[i]!.key); }
  };
  const jump = (key: string) => {
    selection();
    setCurrentKey(key);
    const i = shown.findIndex((r) => r.key === key);
    pages.current?.scrollTo({ x: i * width, animated: true });
  };

  const suggested = shown.filter((r) => !onHome.has(r.key) && (pitches[r.key]?.need ?? 0) > 0).length;
  const offered = shown.filter((r) => !onHome.has(r.key)).length;

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel onClose={onClose} maxHeightFraction={0.92} style={{ paddingHorizontal: 0, paddingTop: 10 }}>
        <View style={{ paddingHorizontal: gutter }}>
          <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>
            {t('home.gallery.addTitle', { defaultValue: 'Add a widget' })}
          </AText>
          <AText variant="caption" tone="muted" style={{ marginTop: 3 }}>
            {suggested
              ? t('home.gallery.helpNow', { count: suggested })
              : offered
                ? t('home.gallery.everything', { defaultValue: 'Everything you can add' })
                : t('home.gallery.none', { defaultValue: 'Nothing left to add.' })}
          </AText>
        </View>

        {/* Every name at once — a dot for a suggestion, grey for one already on the home. */}
        <ScrollView ref={names} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 6, paddingTop: amazen.space(3.5) }}>
          {shown.map((r) => {
            const on = r.key === current?.key;
            const added = onHome.has(r.key);
            const dot = !added && (pitches[r.key]?.need ?? 0) > 0;
            return (
              <Pressable
                key={r.key}
                onPress={() => jump(r.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                  borderWidth: 1, borderColor: on ? c.accent : c.lineGlass, backgroundColor: on ? c.accentTint : 'transparent',
                }}
              >
                {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.warn }} /> : null}
                <AText variant="caption" style={{ fontSize: 12.5, color: on ? c.inkStrong : added ? c.inkMuted : c.ink }}>{widgetTitle(r, t)}</AText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          ref={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPaged}
          contentContainerStyle={{ paddingTop: amazen.space(3) }}
        >
          {shown.map((r) => {
            const p = pitches[r.key];
            const added = onHome.has(r.key);
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
                    {added ? t('home.gallery.onHomeLine', { defaultValue: 'Already on your home screen.' }) : p?.line ?? r.question ?? ''}
                  </AText>
                </View>

                {/*
                  ⚠️ `pointerEvents: none` — it is the widget, but it is not
                  being used. A live card here takes a tap meant for Add.
                */}
                <View pointerEvents="none" style={{ height: FRAME_H, overflow: 'hidden', borderRadius: 22, backgroundColor: c.well, opacity: added ? 0.55 : 1 }}>
                  <View style={{ width: inner / SCALE, transform: [{ scale: SCALE }], transformOrigin: 'top left' }}>
                    <PitchProvider onPitch={hearers[r.key]!}>
                      <r.Component />
                    </PitchProvider>
                  </View>
                  <LinearGradient colors={[`${colors.card}00`, colors.card]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 }} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AText variant="body" tone="strong" style={{ fontSize: 17, fontFamily: amazen.font.sansMedium }}>{widgetTitle(r, t)}</AText>
                    {r.question ? <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>{r.question}</AText> : null}
                  </View>
                  <AText variant="eyebrow" tone="muted" style={{ fontSize: 9.5 }}>
                    {added ? t('home.gallery.onHome', { defaultValue: 'On home' }) : t('home.gallery.addsAtBottom', { defaultValue: 'Adds at the bottom' })}
                  </AText>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* The same place on every page: where you are, and Add. */}
        <View style={{ paddingHorizontal: gutter, paddingTop: amazen.space(3.5), gap: amazen.space(3) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            {shown.map((r) => (
              <View key={r.key} style={{ width: r.key === current?.key ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: r.key === current?.key ? c.accent : c.lineGlass }} />
            ))}
          </View>
          {current ? (
            <PrimaryButton
              label={onHome.has(current.key)
                ? t('home.gallery.isOnHome', { name: widgetTitle(current, t) })
                : t('home.gallery.addName', { name: widgetTitle(current, t) })}
              disabled={onHome.has(current.key)}
              onPress={() => onAdd(current.key)}
            />
          ) : null}
        </View>
      </SheetPanel>
    </BlurSheet>
  );
}
