import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/contexts/theme-context';

export default function ManageLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="time-off-requests" options={{ title: t('manage.titles.timeOffRequests') }} />
      <Stack.Screen name="members" options={{ title: t('manage.members.label') }} />
      <Stack.Screen name="join-requests" options={{ title: t('manage.joinRequests.label') }} />
      <Stack.Screen name="invitations" options={{ title: t('manage.invitations.label') }} />
      <Stack.Screen name="schedules" options={{ title: t('manage.schedules.label') }} />
    </Stack>
  );
}
