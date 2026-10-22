import { useState } from 'react';
import { Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { useAuth } from '../../../../contexts/auth-context';
import { useTheme } from '../../../../contexts/theme-context';
import { portalApi } from '../../../../lib/api/portal';
import { userApi } from '../../../../lib/api';
import { initialOf } from '../../../../lib/people';
import { changeLanguage, getCurrentLanguage, supportedLanguages } from '../../../../i18n';

/** CustomerProfile's state and handlers — everything before its markup, moved here unchanged. */
export function useCustomerProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { colors, isDark, mode, setMode } = useTheme();
  const { t, i18n } = useTranslation();

  const [sheet, setSheet] = useState<null | 'unit' | 'language'>(null);

  // The same sign-out as the staff app (`endSession`): push token, caches, the
  // phone's copy — a request still waiting to be sent is kept for next time.
  const signOut = () => logout();
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
  const initial = initialOf(user);
  const currentLang = supportedLanguages.find((l) => l.code === getCurrentLanguage());
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const openNotifications = () => {
    Linking.openSettings().catch(() =>
      Alert.alert(
        t('portal.notifications', 'Notifications'),
        t('portal.openSettingsFail', 'Open your device settings to manage notifications.'),
      ),
    );
  };
  const pickLanguage = async (code: string) => {
    await changeLanguage(code);
    // Request-status pushes are written on the server; tell it the new language.
    // Best effort — the next launch's push registration carries it anyway.
    userApi.setLocale(code).catch(() => {});
    setSheet(null);
  };

  return {
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
  };
}
