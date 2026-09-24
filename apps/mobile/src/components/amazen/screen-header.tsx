import React from 'react';
import { Image, Pressable, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';

/**
 * The top of a screen — a date, a name, and who you are.
 *
 * ⚠️ THIS REPLACES A NAVIGATION BAR, it is not one. The stock header is a
 * band: a logo on the left, a centred title, an avatar on the right, and a
 * hairline under all of it. It spends the most valuable 56pt on the screen
 * saying the name of the tab you just pressed — which is the one thing the
 * person already knows.
 *
 * What goes there instead is what they do not know: what day it is, and which
 * company's work they are looking at. A member who covers three sites reads
 * that line before anything else on the screen.
 *
 * Every measurement is taken off the design reference at 390pt.
 */
export interface HeaderAction {
  label: string;
  /**
   * What a screen reader says, when the label is a symbol.
   *
   * ⚠️ A SYMBOL IS ONLY ALLOWED WHEN THE MODE ALREADY SAYS WHAT IT IS. A bare
   * ＋ beside "Done" on a jiggling column cannot be misread; the same ＋ on a
   * resting screen could be anything. iOS uses exactly this: a symbol in the
   * corner, and only while editing.
   */
  a11yLabel?: string;
  active?: boolean;
  onPress: () => void;
}

export function ScreenHeader({
  /** The big line — the organization, or the workspace being shown. */
  title,
  /** Overrides the date. Leave unset and it says what day it is. */
  subtitle,
  hint,
  avatarUrl,
  initials,
  onPressAvatar,
  /** An extra control to the left of the avatar — Arrange, on the home screen. */
  action,
  actions,
  style,
}: {
  title: string;
  subtitle?: string;
  /**
   * Replaces the big line while a MODE is open — `Hold to move · tap ⊖ to
   * remove`.
   *
   * ⚠️ IT OCCUPIES THE SAME 30pt BOX THE NAME DOES. The header sits above the
   * scroll view, so anything that changes its height moves the whole column —
   * and the one rule both phones keep is that entering edit mode does not move
   * the content. So the line is swapped, never added, and the box it is drawn
   * in does not resize.
   */
  hint?: string;
  avatarUrl?: string | null;
  initials?: string;
  onPressAvatar?: () => void;
  action?: HeaderAction;
  /**
   * More than one, drawn left to right before the avatar.
   *
   * ⚠️ THE HEADER IS OUTSIDE THE SCROLL VIEW, AND THAT IS THE WHOLE REASON
   * THIS EXISTS. Controls that appear when a mode opens have to live somewhere
   * that cannot move the content — putting the home screen's "Add a widget"
   * in the column pushed every widget down about 60pt the moment the mode
   * opened, under the finger that had just opened it. It is where iOS keeps
   * the same control: a corner of the chrome, not a row in the grid.
   */
  actions?: HeaderAction[];
  style?: ViewStyle;
}) {
  const { amazen } = useTheme();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = amazen.color;

  /*
    "Tuesday, 22 September" — written by the platform, in the member's own
    language, rather than assembled from translated fragments. Five locales
    ship and every one of them orders and punctuates this differently; Intl
    already knows, and a hand-built version would be five strings to keep in
    step for something nobody would thank us for.
  */
  const date =
    subtitle ??
    new Date().toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  return (
    <View
      style={[
        {
          // ⚠️ No status bar is ever drawn — the gradient runs under it.
          paddingTop: insets.top + amazen.space(2),
          paddingHorizontal: 14,
          paddingBottom: amazen.space(3),
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="caption" tone="onGradient" numberOfLines={1} style={{ fontSize: 13 }}>
          {date}
        </AText>
        {/*
          ⚠️ UPPERCASE IS A `textTransform`, NOT THE STRING.

          The organization's name is its own — "BILLA AG" is stored that way and
          "Wien Energie" is not. Upper-casing it here is presentation and can be
          undone; upper-casing it in the data would be a company renamed by a
          stylesheet. And `toLocaleUpperCase` respects Turkish dotless i, where
          the ASCII version does not.
        */}
        {hint ? (
          <View style={{ height: 30, justifyContent: 'center', marginTop: 2 }}>
            <AText variant="caption" tone="onGradient" numberOfLines={1} style={{ fontSize: 13 }}>
              {hint}
            </AText>
          </View>
        ) : (
        <AText
          variant="h2"
          tone="strong"
          numberOfLines={1}
          style={{
            /*
              ⚠️ NO `fontWeight` BESIDE A NAMED FACE — IT MEANS DIFFERENT
              THINGS ON THE TWO PLATFORMS.

              This was `fontWeight: '700'` on top of Readex Pro Medium. Android
              IGNORES a weight when the family names a specific loaded face, so
              it drew Medium 500 — which is what was measured against the
              design reference and approved. iOS SYNTHESISES a faux bold from
              the same face, so the member's name was visibly heavier there
              than on the screen anyone had looked at.

              Readex Pro ships 600 and 700 as real faces; if this ever wants to
              be heavier, LOAD one and name it here. A weight next to a family
              is not a way to ask for that — it is a way to get two different
              answers.
            */
            fontFamily: amazen.font.sansMedium,
            fontSize: 23,
            lineHeight: 30,
            letterSpacing: 0.2,
            textTransform: 'uppercase',
            marginTop: 2,
          }}
        >
          {title}
        </AText>
        )}
      </View>

      {(actions ?? (action ? [action] : [])).map((a) => (
        /*
          ⚠️ A WORD, NOT A PENCIL. "Done" says the mode is on and "Add a
          widget" says what happens — an icon has to carry both, and a pencil
          beside an avatar reads as "edit my profile" before it reads as
          anything about widgets. These are the only things in this header that
          change, so they should be the only things that have to be read.
        */
        <Pressable
          key={a.label}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.a11yLabel ?? a.label}
          accessibilityState={{ selected: !!a.active }}
          hitSlop={8}
          style={({ pressed }) => ({
            paddingHorizontal: amazen.space(3),
            paddingVertical: amazen.space(1.5),
            borderRadius: amazen.radius.full,
            backgroundColor: a.active ? c.accentTint : c.tile,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <AText
            variant="caption"
            tone={a.active ? 'accent' : 'onGradient'}
            style={{ fontFamily: amazen.font.sansMedium, fontSize: 13 }}
          >
            {a.label}
          </AText>
        </Pressable>
      ))}

      <Pressable
        onPress={onPressAvatar}
        accessibilityRole="button"
        accessibilityLabel={initials ? `Profile, ${initials}` : 'Profile'}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 43,
          height: 43,
          borderRadius: amazen.radius.full,
          backgroundColor: c.tile,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: pressed ? 0.75 : 1,
        })}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium, fontSize: 15 }}>
            {initials}
          </AText>
        )}
      </Pressable>
    </View>
  );
}
