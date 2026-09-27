import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useAuth } from '../contexts/auth-context';
import { resolveMediaUrl } from './api';
import { initialsOf } from './people';

/**
 * The avatar at the top right of a screen — what it shows and where it goes.
 *
 * ⚠️ ONE SOURCE, ONE HANDLER. The home's `ScreenHeader`, the Jobs tab's, New
 * job's and the tab navigator's own `ProfileButton` all read this, so the
 * avatar is the same picture and opens the same place on every screen.
 * Uploaded avatars are stored as a relative path (/uploads/avatars/…), which
 * React Native's `<Image>` cannot load — `resolveMediaUrl` makes it absolute.
 */
export function useProfileAvatar(): { avatarUrl: string | null | undefined; initials: string; openProfile: () => void } {
  const { user } = useAuth();
  const router = useRouter();
  const openProfile = useCallback(() => router.push('/(app)/(tabs)/profile' as Href), [router]);
  return { avatarUrl: resolveMediaUrl(user?.avatarUrl), initials: initialsOf(user), openProfile };
}
