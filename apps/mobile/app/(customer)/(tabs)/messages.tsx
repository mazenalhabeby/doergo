import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../src/lib/constants';
import { portalApi } from '../../../src/lib/api/portal';

// Messages with the office/support. A dedicated portal↔office thread backend is
// a follow-up; for now this surfaces who to reach and points back to the request
// timeline (where the office replies today). No fake send.
export default function CustomerMessages() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const configQ = useQuery({ queryKey: ['portal', 'config'], queryFn: portalApi.config });
  const contactLabel = configQ.data?.contactLabel || t('portal.support', 'Support');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + SPACING.md }}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('portal.tabs.messages', 'Messages')}</Text>
      <View style={styles.center}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="chatbubbles-outline" size={34} color={COLORS.primary} />
        </View>
        <Text style={[styles.h, { color: colors.textPrimary }]}>
          {t('portal.contact', 'Contact')} {contactLabel}
        </Text>
        <Text style={[styles.p, { color: colors.textMuted }]}>
          {t(
            'portal.messagesHint',
            'Updates and replies appear on each request’s status timeline. Open a request to follow along.',
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.title, marginHorizontal: SPACING.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl, gap: SPACING.md },
  iconWrap: { width: 72, height: 72, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  h: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xl },
  p: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, textAlign: 'center', lineHeight: 21 },
});
