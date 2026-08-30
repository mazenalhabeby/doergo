import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useDocumentRequirements } from '../contexts/document-requirements-context';
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
  const { actionable, expiringSoon, blocksWork } = useDocumentRequirements();

  if (actionable.length === 0 && expiringSoon.length === 0) return null;

  const showing = actionable.length > 0 ? actionable : expiringSoon;
  const urgent = actionable.length > 0;
  const tone = blocksWork ? COLORS.error : urgent ? COLORS.warning : COLORS.primary;

  const title = urgent
    ? t('documents.reminder.needed', { count: actionable.length })
    : t('documents.reminder.expiring', { count: expiringSoon.length });

  const body = blocksWork
    ? t('documents.reminder.blocking')
    // Names them. "2 documents" makes somebody open the screen to find out
    // which — a round trip the sentence could have saved them.
    : showing.map((r) => r.label).join(' · ');

  return (
    <PressableScale
      onPress={() => router.push('/documents' as Href)}
      accessibilityRole="button"
      /*
        The home screen's own action-card shell, not a shape of its own.

        It sits directly above Clock In, and a card a few pixels off in padding,
        radius or icon size is the most obvious way for a screen to look
        unfinished — which is exactly how the first version looked. The tone
        lives in the ICON TILE, the one thing that is allowed to differ between
        an ordinary action and an urgent one; the coloured rail down the edge
        that used to carry it appeared nowhere else on the screen and read as a
        stray mark rather than a signal.
      */
      style={[homeStyles.actionCard, s.spacing, { backgroundColor: colors.card }, style]}
    >
      <View style={[homeStyles.actionCardIcon, { backgroundColor: `${tone}1F` }]}>
        <Ionicons
          name={blocksWork ? 'alert-circle' : urgent ? 'document-attach' : 'time-outline'}
          size={26}
          color={tone}
        />
      </View>
      <View style={homeStyles.actionCardText}>
        <Text style={[homeStyles.actionCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[homeStyles.actionCardSubtitle, { color: blocksWork ? tone : colors.textMuted }]}
          numberOfLines={2}
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
