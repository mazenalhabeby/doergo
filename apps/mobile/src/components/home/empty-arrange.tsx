import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { WidgetsGlyph } from '../glyphs';

/**
 * THE COLUMN IS EMPTY AND THE MEMBER IS EDITING IT.
 *
 * ⚠️ THIS IS NOT §1'S EMPTY HOME, AND THE TWO MUST NOT BE THE SAME SCREEN.
 * §1 is about somebody READING a home that has nothing on it: it shows two
 * real cards at .42 and asks "keep these?" — an invitation, aimed at a person
 * who was not asking for anything. This is aimed at a person who is already
 * arranging, has just taken the last card off, and needs one thing: the way to
 * put something back. Showing them a preview and a Keep pill answers a
 * question they are not asking, and showing them §1's wording — "here is what
 * you would be seeing right now" — promises a preview that is not there.
 *
 * ⚠️ AND YES, A DASHED OUTLINE — WHICH §1 EXPLICITLY FORBIDS. The reason §1
 * forbids it holds: on a resting screen a dashed box means *something belongs
 * here and is missing*, and nothing is missing, the member chose this. In edit
 * mode the opposite is true. The dashed rectangle is already this screen's
 * word for "a widget goes here" — it is the drop slot, drawn in the same jade
 * at the same weight — so the empty column wearing one is the column saying
 * what it is: a slot, waiting.
 *
 * ⚠️ NOTHING WAS LOST, AND IT SAYS SO. A member who has just removed the last
 * widget has watched five things disappear one at a time. `hidden` is not
 * `deleted` — every key is still in storage with its place — and the one
 * moment that is worth saying out loud is this one.
 */
export function EmptyArrange({
  /** How many this member could have. 0 is a real answer, not a loading state. */
  totalAvailable,
  /**
   * ⚠️ IT CHANGES ONE WORD, NOT THE SCREEN. "Nothing to arrange yet" is true
   * of somebody mid-arrangement and odd on a resting home; "Nothing on your
   * home yet" is the reverse. Everything else — the mark, what they have, the
   * way to add one — is the same answer to the same question, so it is the
   * same component rather than two that drift.
   */
  arranging,
  /** They got here by removing, not by never having any. */
  emptied,
  onAdd,
}: {
  totalAvailable: number;
  arranging: boolean;
  emptied: boolean;
  onAdd: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;

  return (
    <View style={{ gap: amazen.space(3) }}>
      <View
        style={{
          borderRadius: amazen.radius.surface,
          paddingVertical: amazen.space(8),
          paddingHorizontal: amazen.space(5),
          alignItems: 'center',
          gap: amazen.space(2),
        }}
      >
        {/*
          ⚠️ THE OUTLINE IS ITS OWN VIEW, AT THE DROP SLOT'S EXACT WEIGHT.
          `1.5px dashed` jade at 45% is what a slot looks like while a card is
          being dragged over it, and this box has to be the same thing or it is
          a second visual language for one idea. It cannot be a border on the
          container: the 45% would come from `opacity`, which would dim the
          title, the mark and the button along with it.
        */}
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c.accent,
            borderRadius: amazen.radius.surface,
            opacity: 0.45,
          }}
        />
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: amazen.radius.tile,
            backgroundColor: c.tile,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: amazen.space(1),
          }}
        >
          <WidgetsGlyph size={26} color={c.inkOnGradient} />
        </View>

        <AText variant="h3" tone="strong">
          {arranging
            ? t('home.edit.emptyTitle', { defaultValue: 'Nothing to arrange yet' })
            : t('home.nothingYet.title', { defaultValue: 'Nothing on your home yet.' })}
        </AText>

        {/*
          ⚠️ `count`, NEVER an arbitrary `n` — i18next picks the plural form
          from `count` and nothing else, and five languages do not agree with
          English about what "one" means. Zero is its own sentence: offering
          "Add a widget" to somebody who has none would open an empty sheet.
        */}
        <AText variant="caption" tone="onGradient" style={{ textAlign: 'center' }}>
          {totalAvailable > 0
            ? t('home.edit.emptySub', {
                count: totalAvailable,
                defaultValue_one: 'One widget is yours. Add it and it lands here.',
                defaultValue_other: `${totalAvailable} widgets are yours. Add one and it lands here.`,
              })
            : t('home.edit.emptyNone', {
                defaultValue: 'No widgets are available to you yet.',
              })}
        </AText>

        {totalAvailable > 0 ? (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: amazen.space(3),
              paddingVertical: amazen.space(3),
              paddingHorizontal: amazen.space(6),
              borderRadius: amazen.radius.full,
              backgroundColor: c.accentSolid,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AText
              variant="body"
              style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}
            >
              {`＋  ${t('home.edit.add', { defaultValue: 'Add a widget' })}`}
            </AText>
          </Pressable>
        ) : null}
      </View>

      {emptied ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: amazen.space(3),
            backgroundColor: c.well,
            borderRadius: amazen.radius.panel,
            paddingVertical: amazen.space(3.5),
            paddingHorizontal: amazen.space(4),
          }}
        >
          {/*
            ⚠️ A DOT, NOT A WARNING MARK. Nothing went wrong — this is the
            opposite of a warning, and `warn` amber on a reassurance would make
            a member read it as a problem they have caused.
          */}
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: amazen.radius.full,
              backgroundColor: c.accent,
              marginTop: 8,
            }}
          />
          <AText variant="caption" tone="ink" style={{ flex: 1 }}>
            {t('home.edit.emptied', {
              defaultValue: 'You removed all of them. They are still yours — nothing was lost.',
            })}
          </AText>
        </View>
      ) : null}
    </View>
  );
}
