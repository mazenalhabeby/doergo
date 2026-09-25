import { useEffect, useState } from 'react';
import { Dimensions, NativeModules, Platform, type EmitterSubscription } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Cutout } from './geometry';

/**
 * THIS PHONE'S CUTOUT — where the island is born. Measured where the OS says,
 * looked up by model where it does not.
 */

/**
 * THE NOTCH, PER MODEL, IN POINTS — `w × h` of the black cutout.
 *
 * iOS has no API for the cutout rectangle, so the notch comes from the model
 * identifier. ⚠️ Every width errs WIDE: too wide costs a few points of text
 * room beside the notch; too narrow puts text under the camera.
 */
const NOTCH: Record<string, { w: number; h: number }> = {};
const put = (ids: string[], w: number, h: number) => ids.forEach((id) => { NOTCH[id] = { w, h }; });
/* X, XS, XS Max, 11 Pro, 11 Pro Max */
put(['iPhone10,3', 'iPhone10,6', 'iPhone11,2', 'iPhone11,4', 'iPhone11,6', 'iPhone12,3', 'iPhone12,5'], 212, 31);
/* XR, 11 — an LCD at @2x, so the same glass is more points wide */
put(['iPhone11,8', 'iPhone12,1'], 232, 33);
/* 12 mini */
put(['iPhone13,1'], 228, 35);
/* 12, 12 Pro, 12 Pro Max */
put(['iPhone13,2', 'iPhone13,3', 'iPhone13,4'], 212, 33);
/* 13 mini */
put(['iPhone14,4'], 178, 35);
/* 13, 13 Pro, 13 Pro Max, 14, 14 Plus, 16e — the 20% smaller notch */
put(['iPhone14,5', 'iPhone14,2', 'iPhone14,3', 'iPhone14,7', 'iPhone14,8', 'iPhone17,5'], 166, 34);

/** An unknown notch phone, by its inset — the widest notch that inset has shipped with. */
function notchByInset(top: number): { w: number; h: number } {
  if (top >= 50) return { w: 228, h: 35 };
  if (top >= 48) return { w: 232, h: 33 };
  if (top >= 47) return { w: 212, h: 33 };
  return { w: 212, h: 31 };
}

/**
 * iOS: the Dynamic Island is one size on every model; a notch comes from the
 * table; no inset worth a notch is an SE.
 */
export function cutoutFromInset(top: number, screenW: number, modelId?: string | null): Cutout {
  /* Dynamic Island: a floating pill, identical on every model that has one. */
  if (top >= 54) return { x: (screenW - 126) / 2, y: 11, w: 126, h: 37, kind: 'floating' };
  if (top >= 40) {
    const n = (modelId && NOTCH[modelId]) || notchByInset(top);
    return { x: (screenW - n.w) / 2, y: 0, w: n.w, h: n.h, kind: 'edge' };
  }
  /* SE and older: no lens. */
  return { x: screenW / 2, y: 0, w: 0, h: 0, kind: 'none' };
}

/**
 * ANDROID.
 *
 * With a native cutout module, the real rectangle. Without one, nearly every
 * current Android phone has a centred punch hole in the status bar, so the
 * island is born there — a small circle in the middle of the status bar —
 * and is marked `assumed`, so nothing is drawn there while idle.
 */
export function androidCutout(top: number, screenW: number): Cutout {
  const rects = readNativeCutout();
  if (rects && rects.length > 0) {
    const r = rects[0];
    /* ⚠️ `y === 0` means it is attached to the bezel. */
    return { ...r, kind: r.y <= 0 ? 'edge' : 'floating' };
  }
  const d = Math.max(16, Math.min(26, top - 10));
  return { x: (screenW - d) / 2, y: Math.max(4, (top - d) / 2), w: d, h: d, kind: 'floating', assumed: true };
}

/** The iOS model identifier, e.g. `iPhone14,5`. ⚠️ Optional — never stop the app booting. */
function modelId(): string | null {
  try {
    return (require('expo-device') as { modelId?: string | null }).modelId ?? null;
  } catch {
    return null;
  }
}

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Whatever native module happens to expose the cutout, if one is ever added.
 * ⚠️ Optional on purpose — this file must not stop the app booting on a build
 * that does not have it.
 */
function readNativeCutout(): Rect[] | null {
  try {
    const mod = (NativeModules as Record<string, unknown>).DisplayCutout as
      | { boundingRects?: Rect[] }
      | undefined;
    const rects = mod?.boundingRects;
    return Array.isArray(rects) && rects.length ? rects : null;
  } catch {
    return null;
  }
}

/**
 * ⚠️ CACHED ON MOUNT, RE-READ ONLY ON ROTATION. It cannot change otherwise,
 * and re-measuring on every render is a way to make the island jitter while
 * somebody is reading it.
 */
export function useCutout(insets: EdgeInsets): { hole: Cutout; screenW: number } {
  const [size, setSize] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub: EmitterSubscription | { remove(): void } = Dimensions.addEventListener(
      'change',
      ({ window }) => setSize(window),
    );
    return () => sub.remove();
  }, []);

  const screenW = size.width;
  const hole =
    Platform.OS === 'android' ? androidCutout(insets.top, screenW) : cutoutFromInset(insets.top, screenW, modelId());
  return { hole, screenW };
}
