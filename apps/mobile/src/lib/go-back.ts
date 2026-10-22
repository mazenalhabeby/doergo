import { router, type Href } from 'expo-router';

/**
 * Leave the screen: back through the history, or — with none — to `fallback`.
 *
 * ⚠️ `canGoBack()` matters: several screens are also opened by a push
 * notification or a deep link, which can mount them with no history behind —
 * `router.back()` alone silently does nothing there.
 */
export function goBack(fallback: Href = '/(app)/(tabs)' as Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
