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
  return <Stack screenOptions={{ headerShown: false }} />;
}
