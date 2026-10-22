import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';
import { widgetTitle, type WidgetRow } from './registry';

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
  /**
   * ⚠️ TWO, NEVER MORE, AND ALREADY FILTERED. Every one of these has a live
   * answer; the caller chose them. See `home-screen.tsx`.
   */
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

  /*
    ⚠️ IT RENDERS WHAT IT IS GIVEN. This used to filter and slice again, and a
    rule applied in two places is a rule with two answers: the screen took the
    first two off-screen widgets, this dropped the ones with no answer, and a
    first widget that had not loaded cost a suggestion while a ready third one
    sat unused. The choosing happens once, in `home-screen.tsx`.
  */
  const ready = suggestions;

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
              accessibilityLabel={`${t('home.nothingYet.keep', { defaultValue: 'Keep' })} — ${widgetTitle(row, t)}`}
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

      {/*
        ⚠️ NO BUTTONS WHEN THERE IS NOTHING BEHIND THEM. With nothing available
        this row rendered `See all 0` — a control that opens an empty sheet,
        offering the member a choice that does not exist. A member whose
        entitlement grants them no widget at all is a real case, and so is the
        day a registry is being rebuilt.
      */}
      {totalAvailable === 0 ? null : (
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
      )}
    </View>
  );
}
