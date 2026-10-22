import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { CachedImage } from '../cached-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useProfileAvatar } from '../../lib/use-profile-avatar';
import { AText } from './text';
import { TourTarget } from '../../features/tour/tour-target';
import { type HeaderAction, Anchor, TitleAnchor } from './header-back';
export { type HeaderAction, HeaderBack } from './header-back';

export function ScreenHeader({
  /** The big line — the organization, or the workspace being shown. */
  title,
  /** Overrides the date. Leave unset and it says what day it is. */
  subtitle,
  hint,
  /** An extra control to the left of the avatar — Arrange, on the home screen. */
  action,
  actions,
  leading,
  showAvatar = true,
  style,
  tour,
}: {
  title: string;
  subtitle?: string;
  /**
   * Replaces the WHOLE text block while a MODE is open — `Hold to move · tap
   * ⊖ to remove`.
   *
   * ⚠️ IT OCCUPIES EXACTLY THE HEIGHT THE DATE AND THE NAME DID. The header
   * sits above the scroll view, so anything that changes its height moves the
   * whole column — and the one rule both phones keep is that entering edit
   * mode does not move the content. The block is swapped, never added, and it
   * does not resize.
   *
   * ⚠️ AND IT TAKES BOTH LINES, WHICH IS THE FIX FOR A REAL BUG. It used to
   * replace only the name, leaving the date above it and one 13pt line for the
   * sentence. On a 390pt iPhone — beside ＋, Done and the avatar — that is
   * about 193pt of room for a 198pt string, so iOS read `Hold to move · tap ⊖
   * to remo…` while the wider Android emulator read it whole. A member on a
   * small phone was shown a truncated instruction about a mode they had just
   * entered. Two lines is enough room on every phone the app supports,
   * including an SE.
   *
   * ⚠️ AND THE DATE GOES WHILE THE MODE IS OPEN, on purpose. Editing is
   * transient and the header is already showing controls that only exist in
   * it; what day it is can wait thirty seconds. Both platforms replace the
   * whole bar in an edit mode rather than editing one line of it.
   */
  hint?: string;
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
  /**
   * One control before the text — Back, on a screen reached from another
   * (New job). Absent on the home and every tab root, which is why it is a
   * slot and not a flag: the header does not know what "back" means.
   */
  leading?: React.ReactNode;
  /** Off on the Profile page — the avatar is a door to the page you are on. */
  showAvatar?: boolean;
  style?: ViewStyle;
  /**
   * Guided-tour anchors on the header's PARTS — the date and name, and the
   * avatar. ⚠️ Never wrap the whole header: it carries the status bar's inset
   * as padding, so a ring around it sat above the words it described and
   * swallowed the empty strip under the clock.
   */
  tour?: { title?: string; avatar?: string };
}) {
  const { amazen } = useTheme();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = amazen.color;
  /*
    ⚠️ THE AVATAR IS NOT A PROP. Every screen used to pass the same three
    values from `useProfileAvatar` — the same picture, the same handler — and a
    screen that forgot one drew a blank circle that went nowhere. The header
    reads it itself, so it is in the same place, showing the same person and
    opening the same page, on every screen that has a header at all.
  */
  const { avatarUrl, initials, openProfile: onPressAvatar } = useProfileAvatar();

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
      {leading ?? null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {hint ? (
          /*
            ⚠️ 51pt — the date's 19 plus its 2pt gap plus the name's 30. The
            column below must not move by a pixel when the mode opens.
          */
          <View style={{ height: 51, justifyContent: 'center' }}>
            <AText variant="caption" tone="onGradient" numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>
              {hint}
            </AText>
          </View>
        ) : (
          <TitleAnchor name={tour?.title}>
            <AText variant="caption" tone="onGradient" numberOfLines={1} style={{ fontSize: 13 }}>
              {date}
            </AText>
            {/*
              ⚠️ UPPERCASE IS A `textTransform`, NOT THE STRING.

              The organization's name is its own — "BILLA AG" is stored that way
              and "Wien Energie" is not. Upper-casing it here is presentation and
              can be undone; upper-casing it in the data would be a company
              renamed by a stylesheet. And `toLocaleUpperCase` respects Turkish
              dotless i, where the ASCII version does not.
            */}
            <AText
              variant="h2"
              tone="strong"
              numberOfLines={1}
              style={{
                /*
                  ⚠️ NO `fontWeight` BESIDE A NAMED FACE — IT MEANS DIFFERENT
                  THINGS ON THE TWO PLATFORMS.

                  This was `fontWeight: '700'` on top of Readex Pro Medium.
                  Android IGNORES a weight when the family names a specific
                  loaded face, so it drew Medium 500 — which is what was
                  measured against the design reference and approved. iOS
                  SYNTHESISES a faux bold from the same face, so the member's
                  name was visibly heavier there than on the screen anyone had
                  looked at.
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
          </TitleAnchor>
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
        <Anchor key={a.label} name={a.tourKey}>
        <Pressable
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
        </Anchor>
      ))}

      {showAvatar ? (
      <Anchor name={tour?.avatar}>
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
            <CachedImage uri={avatarUrl} style={{ width: '100%', height: '100%' }} />
          ) : (
            <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium, fontSize: 15 }}>
              {initials}
            </AText>
          )}
        </Pressable>
      </Anchor>
      ) : null}
    </View>
  );
}
