import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme, type ThemeMode } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../src/lib/constants';
import { portalApi } from '../../../src/lib/api/portal';
import { usePushNotifications } from '../../../src/hooks/usePushNotifications';
import { changeLanguage, getCurrentLanguage, supportedLanguages } from '../../../src/i18n';

const THEME_OPTIONS: { mode: ThemeMode; icon: any; key: string; fallback: string }[] = [
  { mode: 'system', icon: 'phone-portrait-outline', key: 'portal.themeSystem', fallback: 'System' },
  { mode: 'light', icon: 'sunny-outline', key: 'portal.themeLight', fallback: 'Light' },
  { mode: 'dark', icon: 'moon-outline', key: 'portal.themeDark', fallback: 'Dark' },
];

export default function CustomerProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { unregisterPushToken } = usePushNotifications();
  const { colors, isDark, mode, setMode } = useTheme();
  const { t, i18n } = useTranslation();

  const [sheet, setSheet] = useState<null | 'unit' | 'language'>(null);

  const signOut = async () => {
    try {
      await unregisterPushToken();
    } catch {
      // best-effort — never block logout on token cleanup
    }
    await logout();
  };
  const confirmSignOut = () =>
    Alert.alert(t('portal.signOut', 'Sign out'), t('portal.signOutConfirm', 'Are you sure you want to sign out?'), [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      { text: t('portal.signOut', 'Sign out'), style: 'destructive', onPress: signOut },
    ]);

  const configQ = useQuery({ queryKey: ['portal', 'config'], queryFn: portalApi.config });
  const unitsQ = useQuery({ queryKey: ['portal', 'units'], queryFn: portalApi.units });
  const units = unitsQ.data ?? [];
  const unit = units[0];
  const entityLabel = configQ.data?.entityLabel || t('portal.unit', 'Unit');
  const initial = user?.firstName?.[0]?.toUpperCase() || '?';
  const currentLang = supportedLanguages.find((l) => l.code === getCurrentLanguage());
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const openNotifications = () => {
    Linking.openSettings().catch(() =>
      Alert.alert(t('portal.notifications', 'Notifications'), t('portal.openSettingsFail', 'Open your device settings to manage notifications.')),
    );
  };
  const pickLanguage = async (code: string) => {
    await changeLanguage(code);
    setSheet(null);
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: insets.top + SPACING.lg, paddingBottom: SPACING.xxxl }}
      >
        {/* Identity */}
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]}>
            {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || t('portal.client', 'Client')}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {configQ.data?.name ? `${configQ.data.name}` : ''}
            {configQ.data?.name && unit ? ' · ' : ''}
            {unit ? unit.name : configQ.data?.name ? '' : user?.email}
          </Text>
        </View>

        {/* Account */}
        <Group title={t('portal.account', 'Account')} colors={colors}>
          <Row icon="person-outline" label={t('portal.editProfile', 'Edit profile')} colors={colors} onPress={() => router.push('/(customer)/edit-profile')} />
          <Row icon="key-outline" label={t('portal.changePassword', 'Change password')} colors={colors} onPress={() => router.push('/(customer)/change-password')} last />
        </Group>

        {/* Appearance / theme */}
        <Group title={t('portal.appearance', 'Appearance')} colors={colors}>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((o) => {
              const active = mode === o.mode;
              return (
                <Pressable
                  key={o.mode}
                  onPress={() => setMode(o.mode)}
                  style={[
                    styles.themePill,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    active && { borderColor: COLORS.primary, backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : colors.primaryLight },
                  ]}
                >
                  <Ionicons name={o.icon} size={20} color={active ? COLORS.primary : colors.textSecondary} />
                  <Text style={[styles.themeLabel, { color: active ? COLORS.primary : colors.textPrimary }]}>{t(o.key, o.fallback)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Group>

        {/* Preferences */}
        <Group title={t('portal.preferences', 'Preferences')} colors={colors}>
          <Row icon="globe-outline" label={t('portal.language', 'Language')} value={currentLang ? `${currentLang.flag} ${currentLang.label}` : undefined} colors={colors} onPress={() => setSheet('language')} />
          <Row icon="notifications-outline" label={t('portal.notifications', 'Notifications')} colors={colors} onPress={openNotifications} />
          <Row icon="home-outline" label={t('portal.myUnit', 'My {{entity}}', { entity: entityLabel })} value={unit?.name} colors={colors} onPress={() => setSheet('unit')} last />
        </Group>

        {/* About */}
        <Group title={t('portal.about', 'About')} colors={colors}>
          <Row icon="information-circle-outline" label={t('portal.version', 'Version')} value={appVersion} colors={colors} last />
        </Group>

        {/* Sign out */}
        <Pressable style={[styles.signOut, { borderColor: colors.border }]} onPress={confirmSignOut}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.signOutText}>{t('portal.signOut', 'Sign out')}</Text>
        </Pressable>
      </ScrollView>

      {/* Bottom sheet: unit details / language picker */}
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.lg }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

            {sheet === 'unit' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                  {t('portal.myUnit', 'My {{entity}}', { entity: entityLabel })}
                </Text>
                {units.length === 0 ? (
                  <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>{t('portal.noUnit', 'No unit on file yet.')}</Text>
                ) : (
                  units.map((u) => (
                    <View key={u.id} style={[styles.unitCard, { borderColor: colors.border }]}>
                      <View style={[styles.unitIcon, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="location" size={18} color={COLORS.primaryDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.unitName, { color: colors.textPrimary }]}>{u.name}</Text>
                        {u.address ? <Text style={[styles.unitAddr, { color: colors.textMuted }]}>{u.address}</Text> : null}
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {sheet === 'language' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('portal.language', 'Language')}</Text>
                {supportedLanguages.map((l) => {
                  const active = l.code === i18n.language;
                  return (
                    <Pressable
                      key={l.code}
                      style={[styles.langRow, { borderColor: colors.border }, active && { backgroundColor: colors.primaryLight }]}
                      onPress={() => pickLanguage(l.code)}
                    >
                      <Text style={styles.langFlag}>{l.flag}</Text>
                      <Text style={[styles.langLabel, { color: active ? COLORS.primaryDark : colors.textPrimary }]}>{l.label}</Text>
                      {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                    </Pressable>
                  );
                })}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Group({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

function Row({
  icon, label, value, colors, danger, onPress, last,
}: {
  icon: any; label: string; value?: string; colors: any; danger?: boolean; onPress?: () => void; last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: 1 }, pressed && onPress && { backgroundColor: colors.surface }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name={icon} size={17} color={danger ? COLORS.error : colors.textSecondary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? COLORS.error : colors.textPrimary }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  avatar: { width: 78, height: 78, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  avatarText: { fontFamily: 'Outfit_800ExtraBold', fontSize: 28, color: '#fff' },
  name: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xxl },
  sub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 4 },
  groupTitle: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, letterSpacing: 0.5, marginHorizontal: SPACING.lg + 2, marginBottom: 7 },
  group: { marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: SPACING.md, paddingVertical: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginRight: 4 },
  // theme
  themeRow: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md },
  themePill: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5 },
  themeLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm },
  // sign out
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: SPACING.lg, marginTop: SPACING.xl, paddingVertical: 14, borderRadius: RADIUS.lg, borderWidth: 1 },
  signOutText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, color: COLORS.error },
  // sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  sheetTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, marginBottom: SPACING.md },
  sheetEmpty: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, paddingVertical: SPACING.md },
  unitCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm },
  unitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unitName: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  unitAddr: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 2 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 13, marginBottom: SPACING.sm },
  langFlag: { fontSize: 20 },
  langLabel: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
});
