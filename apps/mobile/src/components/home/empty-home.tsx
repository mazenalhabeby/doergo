import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText, GlassCard, Well } from '../amazen';
import type { WidgetRow } from '../../home/registry';

/**
 * Nothing on your home yet — and here is what you would be seeing.
 *
 * ⚠️ THE REAL COMPONENTS AT .42, NEVER MOCK ROWS OR SCREENSHOTS. The same
 * `<CrewCard/>` with the same data, so the suggestion and the thing it is
 * suggesting can never drift. A drawn approximation of a card is a second copy
 * of it that nobody updates.
 *
 * ❌ NOT "Your home screen is empty", and NOT a dashed "Add a widget" outline.
 * A dashed outline means *something belongs here and is missing* — nothing is
 * broken here, and two real cards are a better invitation than an outline of
 * one.
 *
 * ⚠️ ONLY A SUGGESTION WHOSE DATA HAS ARRIVED. One fewer suggestion beats one
 * that says "loading": the whole point is showing the member their own answer,
 * and a spinner is not one.
 */

export interface Suggestion {
  row: WidgetRow;
  /** That widget's OWN live answer — the same string its subtitle would show. */
  line: string | null;
}

export function EmptyHome({
  suggestions,
  totalAvailable,
  onKeep,
  onKeepBoth,
  onSeeAll,
  style,
}: {
  /** ⚠️ Two, never more — the first two of this profile's default order. */
  suggestions: Suggestion[];
  totalAvailable: number;
  onKeep: (key: string) => void;
  onKeepBoth: () => void;
  onSeeAll: () => void;
  style?: object;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;

  /* A suggestion with no answer yet is simply not offered. */
  const ready = suggestions.filter((s) => s.line !== null).slice(0, 2);

  return (
    <View style={[{ gap: amazen.space(4) }, style]}>
      <View style={{ gap: 4, marginBottom: amazen.space(1) }}>
        <AText variant="h3" tone="strong" style={{ fontWeight: '300' }}>
          {t('home.nothingYet.title', { defaultValue: 'Nothing on your home yet.' })}
        </AText>
        <AText variant="body" tone="onGradient">
          {t('home.nothingYet.sub', {
            defaultValue: 'Here is what you would be seeing right now.',
          })}
        </AText>
      </View>

      {ready.map(({ row, line }) => (
        <View key={row.key}>
          {/*
            ⚠️ `pointerEvents: none` — it is a picture of the widget, not the
            widget. A live card here would take a tap meant for Keep and
            navigate away from the screen that is trying to explain itself.
          */}
          <View pointerEvents="none" style={{ opacity: 0.42 }}>
            <row.Component />
          </View>

          {/* The pill overlaps the bottom of the card it is about. */}
          <View
            style={{
              marginTop: -amazen.space(4),
              marginHorizontal: amazen.space(3),
              flexDirection: 'row',
              alignItems: 'center',
              gap: amazen.space(3),
              backgroundColor: c.well,
              borderRadius: amazen.radius.full,
              paddingVertical: amazen.space(2.5),
              paddingLeft: amazen.space(4),
              paddingRight: amazen.space(2),
              borderWidth: 1,
              borderColor: c.lineWell,
            }}
          >
            <AText variant="caption" tone="ink" numberOfLines={1} style={{ flex: 1 }}>
              {line}
            </AText>
            <Pressable
              onPress={() => onKeep(row.key)}
              accessibilityRole="button"
              accessibilityLabel={`${t('home.nothingYet.keep', { defaultValue: 'Keep' })} — ${t(row.title, { defaultValue: row.key })}`}
              style={({ pressed }) => ({
                paddingVertical: amazen.space(1.5),
                paddingHorizontal: amazen.space(3.5),
                borderRadius: amazen.radius.full,
                backgroundColor: c.accentTint,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <AText variant="caption" tone="accent" style={{ fontFamily: amazen.font.sansMedium }}>
                {t('home.nothingYet.keep', { defaultValue: 'Keep' })}
              </AText>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: amazen.space(3), marginTop: amazen.space(2) }}>
        {ready.length === 2 ? (
          <Pressable
            onPress={onKeepBoth}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1, alignItems: 'center',
              paddingVertical: amazen.space(3.5),
              borderRadius: amazen.radius.full,
              backgroundColor: c.accentSolid,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
              {t('home.nothingYet.keepBoth', { defaultValue: 'Keep both' })}
            </AText>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: ready.length === 2 ? 0 : 1,
            paddingVertical: amazen.space(3.5),
            paddingHorizontal: amazen.space(5),
            alignItems: 'center',
            borderRadius: amazen.radius.full,
            backgroundColor: c.tile,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AText variant="body" tone="ink">
            {t('home.nothingYet.seeAll', {
              n: totalAvailable,
              defaultValue: `See all ${totalAvailable}`,
            })}
          </AText>
        </Pressable>
      </View>
    </View>
  );
}

/** Glass on three cards only; everything else is a well. */
export function WidgetSurface({
  surface, children, style,
}: { surface: 'glass' | 'well'; children: React.ReactNode; style?: object }) {
  return surface === 'glass'
    ? <GlassCard style={style}>{children}</GlassCard>
    : <Well style={style}>{children}</Well>;
}
