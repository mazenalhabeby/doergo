/**
 * Guides sheet — the mobile "Take a tour" launcher. Lists every guide the user
 * is eligible for (gated) with a "this screen" shortcut at the top, and replays
 * any of them. Opened from a Profile menu item.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../lib/constants';
import { useTour } from './tour-context';

export function GuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { availableTours, contextualTourId, start } = useTour();

  const launch = (id: string) => {
    onClose();
    // Let the sheet close before the tour begins (avoids overlay stacking).
    setTimeout(() => start(id), 220);
  };

  const contextual = contextualTourId ? availableTours.find((tr) => tr.id === contextualTourId) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('tours.menuTitle')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
          {contextual && (
            <>
              <Text style={[styles.section, { color: colors.textMuted }]}>{t('tours.thisScreen')}</Text>
              <Row
                icon={contextual.icon}
                label={t(contextual.titleKey)}
                subtitle={t('tours.showMeAround')}
                highlight
                colors={colors}
                onPress={() => launch(contextual.id)}
              />
            </>
          )}

          <Text style={[styles.section, { color: colors.textMuted }]}>{t('tours.allGuides')}</Text>
          {availableTours.map((tr) => (
            <Row key={tr.id} icon={tr.icon} label={t(tr.titleKey)} colors={colors} onPress={() => launch(tr.id)} />
          ))}
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  subtitle,
  highlight,
  colors,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  highlight?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: highlight ? COLORS.primary : colors.primaryLight }]}>
        <Ionicons name={icon as never} size={18} color={highlight ? COLORS.white : COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#94a3b8', marginTop: SPACING.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  section: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  rowIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  rowSub: { fontSize: FONT_SIZE.sm, marginTop: 1 },
});
