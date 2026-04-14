import { Stack } from 'expo-router';
import { useTheme } from '../../../src/contexts/theme-context';

export default function ManageLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="time-off-requests" options={{ title: 'Time Off Requests' }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="join-requests" options={{ title: 'Join Requests' }} />
      <Stack.Screen name="invitations" options={{ title: 'Invitations' }} />
      <Stack.Screen name="schedules" options={{ title: 'Schedules' }} />
    </Stack>
  );
}
