import React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText } from '../amazen';
import { widgetTitle, type WidgetRow } from '../../home/registry';

/**
 * The gallery — one widget per page, swiped sideways.
 *
 * ⚠️ THE PREVIEW IS THE REAL COMPONENT WITH REAL DATA, NEVER A SCREENSHOT AND
 * NEVER A LABEL. A screenshot goes stale the first time the card changes, and
 * a list of names asks somebody to decide from a word what they can decide
 * from the thing itself. This is the same `<CrewCard/>` the home renders, with
 * the same data, so the two can never drift.
 *
 * ⚠️ A WIDGET WHOSE DATA HAS NOT ARRIVED IS NOT OFFERED YET. An empty card in
 * a gallery is an argument against adding it — the member reads "this widget
 * has nothing in it" and is right, today, for the wrong reason.
 */
export function WidgetGallery({
  visible,
  onClose,
  offScreen,
  onAdd,
  hasData,
}: {
  visible: boolean;
  onClose: () => void;
  /** Available to this member and not on their home. */
  offScreen: WidgetRow[];
  onAdd: (key: string) => void;
  /** Has this widget's answer arrived? One that has not is not offered. */
  hasData: (row: WidgetRow) => boolean;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  /*
    ⚠️ `useWindowDimensions`, NOT `Dimensions.get`. The static read is taken
    once at render and never again, so a rotation — or an iPad split view —
    leaves every page the width of the old orientation and the paging stops
    landing on a card.
  */
  const { width } = useWindowDimensions();
  const page = width - amazen.space(8);
  const stride = page + amazen.space(3);

  const offered = offScreen.filter(hasData);

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel onClose={onClose} style={{ paddingHorizontal: 0, paddingTop: 10 }}>
        <View style={{ paddingHorizontal: amazen.space(4) }}>
          <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>
            {t('home.gallery.title', { defaultValue: 'Widgets' })}
          </AText>
          <AText variant="caption" tone="muted" style={{ marginTop: 3 }}>
            {/*
              ⚠️ `count`, NEVER an arbitrary `n`. i18next selects the plural
              form from `count` and nothing else, so "1 more are yours" is
              what an `n` gets you — in five languages, three of which have
              plural rules English does not.
            */}
            {offered.length
              ? t('home.gallery.sub', {
                  count: offered.length,
                  defaultValue_one: `${offered.length} more is yours. Swipe to see it.`,
                  defaultValue_other: `${offered.length} more are yours. Swipe to see them.`,
                })
              : t('home.gallery.none', { defaultValue: 'Nothing left to add.' })}
          </AText>
        </View>

        <ScrollView
          horizontal
          /*
            ⚠️ NOT `pagingEnabled`. It snaps to whole SCREEN widths, and a page
            here is the screen less its gutters plus the gap to the next one —
            so the two rules fight and every page after the first lands further
            off. `snapToInterval` is the one that knows how wide a page is.
          */
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={stride}
          snapToAlignment="start"
          disableIntervalMomentum
          contentContainerStyle={{
            paddingHorizontal: amazen.space(4),
            gap: amazen.space(3),
            paddingVertical: amazen.space(4),
          }}
        >
          {offered.map((row) => (
            <View key={row.key} style={{ width: page }}>
              {/*
                ⚠️ `pointerEvents: none` — it is the widget, but it is not
                being used. A live card here takes a tap meant for Add and
                navigates away from the sheet that is trying to sell it.
              */}
              <View pointerEvents="none">
                <row.Component />
              </View>

              <AText variant="body" tone="strong" style={{ marginTop: amazen.space(3) }}>
                {widgetTitle(row, t)}
              </AText>
              {row.question ? (
                <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {row.question}
                </AText>
              ) : null}

              <Pressable
                onPress={() => onAdd(row.key)}
                accessibilityRole="button"
                accessibilityLabel={`${t('home.gallery.add', { defaultValue: 'Add widget' })} — ${widgetTitle(row, t)}`}
                style={({ pressed }) => ({
                  marginTop: amazen.space(4),
                  paddingVertical: amazen.space(3.5),
                  borderRadius: amazen.radius.full,
                  alignItems: 'center',
                  backgroundColor: c.accentSolid,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
                  {`＋  ${t('home.gallery.add', { defaultValue: 'Add widget' })}`}
                </AText>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SheetPanel>
    </BlurSheet>
  );
}
