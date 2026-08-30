import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useDocumentRequirements } from '../contexts/document-requirements-context';
import { summarisePending } from '@hbcfield/shared/client';
import { COLORS, SPACING } from '../lib/constants';
import { styles as homeStyles } from './home/home-styles';
import { PressableScale } from './pressable-scale';

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
 * Two tones, because two different things are being said. Something that stops
 * work being assigned is a blockage and looks like one; a certificate running
 * out in three weeks is information, and dressing it as an alarm is what makes
 * people stop believing the alarms.
 */
export function DocumentsReminderCard({ style }: { style?: object }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { toUpload, toSign, expiringSoon } = useDocumentRequirements();

  /*
    ONE card whatever is outstanding.

    A member can owe two different things at once — a document to supply and one
    already issued to them waiting for a signature — and the obvious build is a
    card for each, which doubles the space a piece of admin takes on a home
    screen that has a shift and a day's work to show. The line changes instead
    of multiplying.

    The rule is shared with the web so the two can never quote different
    numbers for the same person.
  */
  const p = summarisePending({ toUpload, toSign, expiring: expiringSoon });
  if (p.empty) return null;

  const tone = p.blocksWork ? COLORS.error
    : p.titleKey === 'expiring' ? COLORS.primary
    : COLORS.warning;

  const icon = p.blocksWork ? 'alert-circle'
    : p.titleKey === 'toSign' ? 'create'
    : p.titleKey === 'expiring' ? 'time-outline'
    : 'document-attach';

  const body = p.blocksWork
    ? t('documents.reminder.blocking')
    : p.mixed
      // Both kinds: what they are in for, not six names in a two-line space.
      ? [
          t('documents.reminder.partUpload', { count: p.uploadCount }),
          t('documents.reminder.partSign', { count: p.signCount }),
        ].join(' · ')
      // One kind: name them. A bare count makes somebody open the screen just
      // to find out which, a round trip the sentence could have saved.
      : p.names.join(' · ');

  return (
    <PressableScale
      onPress={() => router.push('/documents' as Href)}
      accessibilityRole="button"
      /*
        The home screen's own action-card shell, not a shape of its own.

        It sits directly above Clock In, and a card a few pixels off in padding,
        radius or icon size is the most obvious way for a screen to look
        unfinished. The tone lives in the ICON TILE, the one thing allowed to
        differ between an ordinary action and an urgent one.
      */
      style={[homeStyles.actionCard, s.spacing, { backgroundColor: colors.card }, style]}
    >
      <View style={[homeStyles.actionCardIcon, { backgroundColor: `${tone}1F` }]}>
        <Ionicons name={icon} size={26} color={tone} />
      </View>
      <View style={homeStyles.actionCardText}>
        <Text style={[homeStyles.actionCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {t(`documents.reminder.${p.titleKey}`, { count: p.count })}
        </Text>
        <Text
          style={[homeStyles.actionCardSubtitle, { color: p.blocksWork ? tone : colors.textMuted }]}
          numberOfLines={1}
        >
          {body}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  // Whatever follows on the home screen is another card of the same shape, and
  // the greeting above already supplies its own bottom padding.
  spacing: { marginBottom: SPACING.md },
});
