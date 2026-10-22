import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Reanimated, {
  interpolateColor, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../../components/blur-sheet';
import { SheetPanel } from '../../components/sheet-panel';
import { AText, PrimaryButton } from '../../components/amazen';
import { widgetTitle, type WidgetRow } from './registry';
import { PitchProvider, type Pitch } from './pitch';
import { selection } from '../../lib/haptics';
import { useAuth } from '../../contexts/auth-context';
import { holds } from '../../lib/permissions';
import { useWidgetGallery } from './use-widget-gallery';
import { SCALE, FRAME_H, Dot } from './widget-gallery-helpers';

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
  const {
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
  } = useWidgetGallery({ visible, onClose, rows, onHome, onAdd, onUndo, hasData });

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
        <ScrollView
          ref={names}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, gap: 6, paddingTop: amazen.space(3.5) }}>
          <Reanimated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: amazen.space(3.5),
                bottom: 0,
                borderRadius: 999,
                backgroundColor: c.accentTint,
                borderWidth: 1,
                borderColor: c.accent,
              },
              highlight,
            ]}
          />
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
                <AText
                  variant="caption"
                  style={{ fontSize: 12.5, color: on ? c.inkStrong : added ? c.inkMuted : c.ink }}
                >
                  {widgetTitle(r, t)}
                </AText>
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
                <View
                  pointerEvents="none"
                  style={{
                    height: FRAME_H,
                    overflow: 'hidden',
                    borderRadius: 22,
                    backgroundColor: c.well,
                    opacity: added ? 0.55 : 1,
                  }}>
                  <View style={{ width: inner / SCALE, transform: [{ scale: SCALE }], transformOrigin: 'top left' }}>
                    <PitchProvider onPitch={hearers[r.key]!}>
                      <row.Component />
                    </PitchProvider>
                  </View>
                  <LinearGradient
                    colors={[`${colors.card}00`, colors.card]}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 }}
                  />
                </View>

                <View>
                  <AText variant="body" tone="strong" style={{ fontSize: 17, fontFamily: amazen.font.sansMedium }}>
                    {widgetTitle(r, t)}
                  </AText>
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
                <PrimaryButton
                  label={t('home.gallery.addName', { name: widgetTitle(current, t) })}
                  onPress={() => toggle(current.key)}
                  style={{ flex: 1 }}
                />
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
                  <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium }}>
                    {t('home.gallery.done', { count: addedNow.length })}
                  </AText>
                </Pressable>
              ) : null}
            </Reanimated.View>
          ) : null}
        </View>
      </SheetPanel>
    </BlurSheet>
  );
}
