import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useDocumentRequirements } from '../contexts/document-requirements-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
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
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    >
      {/* A colour-bearing rail rather than a tinted card: the tone is
          unmistakable and the text still sits on the normal surface, where it
          keeps normal contrast in both themes. */}
      <View style={[s.rail, { backgroundColor: tone }]} />
      <View style={[s.icon, { backgroundColor: `${tone}1F` }]}>
        <Ionicons
          name={blocksWork ? 'alert-circle' : urgent ? 'document-attach' : 'time-outline'}
          size={20}
          color={tone}
        />
      </View>
      <View style={s.text}>
        <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        <Text style={[s.body, { color: colors.textSecondary }]} numberOfLines={2}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.md, paddingRight: SPACING.md, paddingLeft: SPACING.lg,
    overflow: 'hidden',
    // The gutter every home section uses. Overridable by `style` for anywhere
    // else, but a caller should not have to restate the page's own margin.
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm,
  },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  icon: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.2 },
  body: { fontSize: FONT_SIZE.sm, lineHeight: 17 },
});
