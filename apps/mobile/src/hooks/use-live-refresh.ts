import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Keep a live answer live: ask on every return to the screen, once a minute
 * while it is showing, and when the app comes back to the foreground.
 *
 * ⚠️ A home card that asked once when the app opened kept showing that
 * morning's copy — the tabs keep the home screen mounted. One hook, so every
 * card that shows something that moves refreshes the same way.
 */
export function useLiveRefresh(refresh: () => unknown, everyMs = 60_000): void {
  useFocusEffect(useCallback(() => {
    void refresh();
    const id = setInterval(() => void refresh(), everyMs);
    return () => clearInterval(id);
  }, [refresh, everyMs]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);
}
