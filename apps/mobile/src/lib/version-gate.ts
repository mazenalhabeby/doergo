import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL } from './api/client';

/**
 * Is this build still allowed to run?
 *
 * Over-the-air updates carry JS. They cannot carry native code, so a phone on
 * an old BUILD stays there — and the Android APK is served from our own site,
 * where nothing auto-updates. That fleet has no way to be moved forward, which
 * is why the update history keeps a separate "1.0.0 train" running
 * indefinitely. This is the mechanism that ends it: the server names a minimum
 * version, and a build below it stops and says so.
 *
 * Every failure path here lets the app through. A gate on a network call is a
 * gate that fails when the network does, and locking every user out of a
 * working app because a request timed out is far worse than letting an outdated
 * one keep working for another launch.
 */
export interface VersionStatus {
  blocked: boolean;
  current: string;
  minimum: string | null;
  latest: string | null;
  downloadUrl: string | null;
}

/** Numeric compare of dotted versions. Returns <0, 0, >0 like a comparator. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function currentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

const TIMEOUT_MS = 6000;

export async function checkVersion(): Promise<VersionStatus> {
  const current = currentVersion();
  const open: VersionStatus = { blocked: false, current, minimum: null, latest: null, downloadUrl: null };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${API_URL}/app/version`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return open; // 404 on an older API, 5xx, anything — let it run

    const data = (await res.json()) as {
      minimum?: string | null;
      latest?: string | null;
      downloads?: { android?: string | null; ios?: string | null };
    };

    const minimum = data?.minimum ?? null;
    const downloadUrl =
      (Platform.OS === 'ios' ? data?.downloads?.ios : data?.downloads?.android) ?? null;

    return {
      // No minimum configured means no gate. The server ships that way on
      // purpose: a gate that blocks the day it deploys, before anyone has been
      // given a version to move to, locks out the whole fleet at once.
      blocked: !!minimum && compareVersions(current, minimum) < 0,
      current,
      minimum,
      latest: data?.latest ?? null,
      downloadUrl,
    };
  } catch {
    return open;
  }
}
