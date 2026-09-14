import { Stack } from 'expo-router';

/**
 * No native header on any of these.
 *
 * ⚠️ The six management screens used to take their header from this Stack,
 * which made them the only screens in the app whose bar was drawn by the
 * navigator rather than by `ScreenHeader` — a different back glyph, a
 * different title position (the native default is left-aligned on Android),
 * and no way to keep the two in step as either changes. They render the same
 * bar as everywhere else now.
 *
 * The Stack itself stays: it is what gives these screens their own push
 * history, so `members → member detail` pops correctly.
 */
export default function ManageLayout() {
  /*
    Each screen named, though the stack hides every header already: the
    registration spec's rule is "register it, whatever you want it to do", and
    a screen added here later without a line is exactly what it exists to catch.
  */
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="attendance" options={{ headerShown: false }} />
      <Stack.Screen name="invitations" options={{ headerShown: false }} />
      <Stack.Screen name="join-requests" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ headerShown: false }} />
      <Stack.Screen name="schedules" options={{ headerShown: false }} />
      <Stack.Screen name="time-off-requests" options={{ headerShown: false }} />
    </Stack>
  );
}
