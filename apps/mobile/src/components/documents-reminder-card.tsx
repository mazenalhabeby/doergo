import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useDocumentRequirements } from '../contexts/document-requirements-context';
import { summarisePending } from '@hbcfield/shared/client';
import { PressableScale } from './pressable-scale';
import { AText } from './amazen';
/*
  ⚠️ FROM THE GLYPH FILES, NOT A BARREL THAT RE-EXPORTS SCREENS.

  This imported from `./home`, whose index also exported four whole home
  screens — so a card that wanted five drawings pulled `admin-dashboard` and
  three siblings into the bundle and created a require cycle with them. The
  device log carried 72 of those warnings. A barrel is only safe when
  everything behind it is the same KIND of thing.
*/
import {
  DocNeededGlyph, DocExpiringGlyph, DocBlockedGlyph, CountersignGlyph,
} from './glyphs/doc-glyphs';
import { SignGlyph } from './glyphs/tile-glyphs';
import type { GlyphProps } from './glyphs/glyphs';

/**
 * "You still owe us a document", said once.
 *
 * ONE card, on the home screen, and nothing anywhere else except a count on the
 * way in. The tempting version of this feature puts a banner on every screen,
 * and that version stops working within a week: people learn the shape of a
 * thing that is always there and read past it, so the day it finally matters it
 * is invisible — and in the meantime it has taken a strip off the top of screens
 * that have nothing to do with documents.
 *
 * It renders nothing when there is nothing outstanding, which is the normal
 * case, so the home screen is unchanged for everybody who is up to date. No
 * dismiss button on purpose: dismissing either hides a real obligation or
 * teaches people that the reminder is optional, and there is already a way to
 * make it go away — supply the document.
 *
 * Three tones, because three different things are being said. Something that
 * stops work being assigned is a blockage and looks like one; a certificate
 * running out in three weeks is information, and dressing it as an alarm is
 * what makes people stop believing the alarms. `warn` is the third — owed, or
 * waiting — and it exists because encoding *owed* as *failure* is what made
 * every unapproved thing in this app read as a fault.
 *
 * ⚠️ THE LINE CHANGES INSTEAD OF MULTIPLYING. A member can owe two different
 * things at once and the obvious build is a card for each, which doubles the
 * space a piece of admin takes on a home screen that has a shift and a day's
 * work to show.
 *
 * ⚠️ ONE STATE SHORT OF THE DESIGN, ON PURPOSE. §4 of
 * `docs/design/documents-due/SPEC.md` names TWO cases that earn a second line:
 * a colleague's name, and a REJECTION'S REASON. Only the first is here.
 *
 * The second needs `/documents/pending` to return refused requirements as
 * their own list carrying `rejectionReason` — `waitingOnMember()` folds
 * REJECTED into `toUpload` today, so a member whose licence came back reads
 * "1 document to upload", the same sentence somebody who never sent one gets,
 * and photographs the same cut-off card again. That is a SERVER change and it
 * was declined, so the state is not built rather than faked: there is no
 * honest way to show a reason the phone was never sent.
 *
 * The summary rule lives in `packages/shared` so the phone and the web can
 * never quote different numbers for the same person.
 */
export function DocumentsReminderCard({ style }: { style?: object }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { toUpload, toSign, expiringSoon } = useDocumentRequirements();
  const c = amazen.color;

  const p = summarisePending({ toUpload, toSign, expiring: expiringSoon });
  if (p.empty) return null;

  /*
    ⚠️ TONE DOES NOT FOLLOW THE HEADLINE.

    `blocksWork` on any single requirement makes the whole row critical
    whatever the title says — a missing licence that stops somebody being
    given work is the most important fact on the card even when the headline
    is about a signature.
  */
  const tone: 'critical' | 'warn' | 'accent' =
    p.blocksWork ? 'critical'
    : p.titleKey === 'expiring' ? 'accent'
    : 'warn';

  const toneColor = tone === 'critical' ? c.critical : tone === 'warn' ? c.warn : c.accent;
  const toneTint = tone === 'critical' ? c.criticalTint : tone === 'warn' ? c.warnTint : c.accentTint;

  /*
    Four of the five marks are ONE identical sheet with a different badge
    bitten out of the corner. That sameness inverts the family's usual rule and
    is deliberate: the row shows exactly one of them, so they never compete —
    and they are the same object in four conditions, so they should look it.

    `CountersignGlyph` is the exception, two sheets and a figure, because it is
    the only one that is not about a document of yours.
  */
  const Glyph: React.ComponentType<GlyphProps> =
    p.blocksWork ? DocBlockedGlyph
    : p.countersign ? CountersignGlyph
    : p.titleKey === 'toSign' ? SignGlyph
    : p.titleKey === 'expiring' ? DocExpiringGlyph
    : DocNeededGlyph;

  const title =
    p.countersign
      ? t('documents.reminder.countersign', { name: p.countersign.forMember, label: p.countersign.title })
      : t(`documents.reminder.${p.titleKey}`, { count: p.count });

  const subtitle =
    p.countersign
      ? t('documents.reminder.countersignNote')
      : p.blocksWork
          ? t('documents.reminder.blocking')
          : p.mixed
            // Both kinds: what they are in for, not six names in a two-line space.
            ? [
                t('documents.reminder.partUpload', { count: p.uploadCount }),
                t('documents.reminder.partSign', { count: p.signCount }),
              ].join(' · ')
            // One kind: name them. A bare count makes somebody open the screen
            // just to find out which, a round trip the sentence could have saved.
            : p.names.join(' · ');

  /*
    The second line, and the only two that exist.

    Without the reviewer's own words the member repeats the mistake — which is
    the entire reason the sent-back state is worth telling apart from a missing
    one.
  */
  const second =
    p.countersign && p.countersignCount > 1
      // Several are waiting: the card names the first and says how many more.
      ? t('documents.reminder.countersignMore', { count: p.countersignCount - 1 })
      : null;

  return (
    <PressableScale
      onPress={() => router.push('/documents' as Href)}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, second].filter(Boolean).join('. ')}
      style={[
        {
          backgroundColor: c.well,
          borderRadius: amazen.radius.panel,
          padding: amazen.space(4),
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: amazen.space(3.5),
        },
        style,
      ]}
    >
      {/*
        The tone lives in the ICON TILE — the one thing allowed to differ
        between an ordinary reminder and an urgent one. The card's own shape,
        padding and radius are the same in every state, because a card a few
        pixels off is the most obvious way for a screen to look unfinished.
      */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: amazen.radius.tile,
          backgroundColor: toneTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* `contrast` is the SURFACE — the tint composited over the well, not a
            colour choice. Wrong and it draws a grey ghost across the mark. */}
        <Glyph size={26} color={toneColor} contrast={c.well} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <AText variant="body" tone="strong" numberOfLines={2}>{title}</AText>
        <AText
          variant="caption"
          tone={tone === 'critical' ? 'critical' : 'muted'}
          numberOfLines={2}
        >
          {subtitle}
        </AText>

        {second ? (
          <View style={{ marginTop: amazen.space(2), gap: amazen.space(2) }}>
            <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.lineWell }} />
            <View style={{ flexDirection: 'row', gap: amazen.space(2), alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 6, height: 6, borderRadius: amazen.radius.full,
                  backgroundColor: toneColor, marginTop: 5,
                }}
              />
              <AText variant="caption" tone="ink" numberOfLines={3} style={{ flex: 1 }}>
                {second}
              </AText>
            </View>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}
