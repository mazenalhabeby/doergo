import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="choose-path" />
      <Stack.Screen name="create-org" />
      <Stack.Screen name="join-org" />
      <Stack.Screen name="use-invitation" />
      <Stack.Screen name="pending-approval" />
    </Stack>
  );
}
