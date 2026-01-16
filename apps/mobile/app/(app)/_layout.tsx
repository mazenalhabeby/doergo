import { Stack } from 'expo-router';

const PRIMARY_COLOR = '#2563EB';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: 'white',
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: '#1e293b',
        },
        headerTintColor: PRIMARY_COLOR,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="task/[id]"
        options={{
          title: 'Task Details',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
