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
import { userApi } from '../../../src/lib/api';
import { initialOf } from '../../../src/lib/people';
import { changeLanguage, getCurrentLanguage, supportedLanguages } from '../../../src/i18n';
import { personName } from '@hbcfield/shared/client';
import { useCustomerProfile } from '../../../src/screens/customer/tabs/use-customer-profile';
import {
  THEME_OPTIONS,
  Group,
  Row,
  styles,
} from '../../../src/screens/customer/tabs/customer-profile-helpers';

export default function CustomerProfile() {
  const {
    insets,
    router,
    user,
    colors,
    isDark,
    mode,
    setMode,
    t,
    i18n,
    sheet,
    setSheet,
    signOut,
    confirmSignOut,
    configQ,
    units,
    unit,
    entityLabel,
    initial,
    currentLang,
    appVersion,
    openNotifications,
    pickLanguage,
  } = useCustomerProfile();

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
            {personName(user) || t('portal.client', 'Client')}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {configQ.data?.name ? `${configQ.data.name}` : ''}
            {configQ.data?.name && unit ? ' · ' : ''}
            {unit ? unit.name : configQ.data?.name ? '' : user?.email}
          </Text>
        </View>

        {/* Account */}
        <Group title={t('portal.account', 'Account')} colors={colors}>
          <Row
            icon="person-outline"
            label={t('portal.editProfile', 'Edit profile')}
            colors={colors}
            onPress={() => router.push('/(customer)/edit-profile')}
          />
          <Row
            icon="key-outline"
            label={t('portal.changePassword', 'Change password')}
            colors={colors}
            onPress={() => router.push('/(customer)/change-password')}
            last
          />
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
          <Row
            icon="globe-outline"
            label={t('portal.language', 'Language')}
            value={currentLang ? `${currentLang.flag} ${currentLang.label}` : undefined}
            colors={colors}
            onPress={() => setSheet('language')}
          />
          <Row
            icon="notifications-outline"
            label={t('portal.notifications', 'Notifications')}
            colors={colors}
            onPress={openNotifications}
          />
          <Row
            icon="home-outline"
            label={t('portal.myUnit', 'My {{entity}}', { entity: entityLabel })}
            value={unit?.name}
            colors={colors}
            onPress={() => setSheet('unit')}
            last
          />
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
