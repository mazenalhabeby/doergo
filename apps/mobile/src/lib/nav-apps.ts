import { Linking, Platform } from 'react-native';
import {
  NAV_APP_PROBES, NAV_APP_LABELS, navAppCandidates, isAlwaysAvailable,
  type NavApp,
} from '@hbcfield/shared/client';

export type InstalledNavApp = { key: NavApp; label: string };

/**
 * Which navigation apps this device can actually open.
 *
 * The screen used to carry a preference — three chips, one of them chosen —
 * and then hand the URL to whichever was selected. On a phone without Waze
 * that is a link nobody can open, and the failure was swallowed by a
 * `.catch(() => {})`: the button did nothing at all, twice, before anyone
 * would think to change a setting they never set.
 *
 * Asking the device turns a preference into a fact, and the fact decides the
 * interaction: nothing to choose between means no question worth asking.
 */
export async function detectNavApps(): Promise<InstalledNavApp[]> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const found: InstalledNavApp[] = [];

  for (const key of navAppCandidates(platform)) {
    if (isAlwaysAvailable(key, platform)) {
      found.push({ key, label: NAV_APP_LABELS[key] });
      continue;
    }
    const probe = NAV_APP_PROBES[key];
    if (!probe) continue;
    try {
      // Throws on a malformed scheme, and on iOS returns false for anything
      // missing from LSApplicationQueriesSchemes — both mean "do not offer it".
      if (await Linking.canOpenURL(probe)) {
        found.push({ key, label: NAV_APP_LABELS[key] });
      }
    } catch {
      /* not installed, or not queryable — either way it is not an option */
    }
  }
  return found;
}

/**
 * What should happen when somebody asks to navigate.
 *
 * ⚠️ 'open' on an EMPTY list is deliberate, and it is the case that keeps this
 * safe. Detection can come back empty for a reason that has nothing to do with
 * what is installed — an iOS build whose Info.plist predates the scheme list
 * cannot see any of them. Treating that as "you have no maps" would break
 * navigation for everyone on that build. The universal link still opens
 * whatever the system prefers, so an empty answer behaves exactly as the app
 * did before any of this existed.
 */
export function navDecision(apps: InstalledNavApp[]): 'open' | 'choose' {
  return apps.length > 1 ? 'choose' : 'open';
}

/** The one to use when there is nothing to ask about. */
export function soleNavApp(apps: InstalledNavApp[]): NavApp {
  return apps[0]?.key ?? (Platform.OS === 'ios' ? 'apple' : 'google');
}
