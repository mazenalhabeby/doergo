import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { BlurSheet } from '../components/blur-sheet';
import { SheetPanel } from '../components/sheet-panel';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { purposeOf, type MediaPurpose } from './purposes';
import { ensureAccess, type AccessOutcome } from './use-media-access';

/**
 * The same explanation, for flows that cannot take over the screen.
 *
 * The image picker is called from inside sheets — a task, a shift issue, a
 * work-log note — so it has no screen of its own to render a permission state
 * on. It used to cope with a native `Alert`:
 *
 *     Alert.alert('Permission Required',
 *       `Please allow ${type} access in settings.`)
 *
 * which was hard-coded English in an app shipping five languages, said "in
 * settings" the FIRST time somebody declined (when asking again would have
 * worked), and made no case for why the camera was wanted at all.
 *
 * ⚠️ MOUNTED ONCE, driven imperatively. `requestMediaAccess()` can be awaited
 * from any event handler and resolves when the person decides — so seven call
 * sites got the explanation without seven of them changing. A provider per
 * consumer would have been the same sheet written seven times, which is how
 * the wording drifts apart again.
 */

type Pending = {
  kind: 'camera' | 'library';
  purpose: MediaPurpose;
  resolve: (ok: boolean) => void;
};

let show: ((p: Pending) => void) | null = null;

/**
 * Ask for the camera or the library, explaining why, and resolve with the
 * answer. Falls back to the bare OS prompt when the host is not mounted —
 * degraded, never broken.
 */
export async function requestMediaAccess(
  kind: 'camera' | 'library',
  purpose: MediaPurpose,
): Promise<boolean> {
  const outcome: AccessOutcome = await ensureAccess(kind);
  if (outcome === 'granted') return true;

  // Only worth a sheet once the plain request has failed: on a first grant the
  // OS dialog is the whole interaction and a sheet in front of it is a second
  // thing to dismiss.
  if (!show) return false;
  return new Promise<boolean>((resolve) => show!({ kind, purpose, resolve }));
}

export function MediaAccessHost() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    show = setPending;
    return () => { show = null; };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  if (!pending) return null;
  const p = purposeOf(pending.purpose);
  const isCamera = pending.kind === 'camera';

  return (
    <BlurSheet visible onClose={() => close(false)}>
      {/* The shared panel, not a bare View: every sheet in the app carries the
          same surface, grabber and safe-area handling, and `sheet-surface.spec`
          fails anything that quietly draws its own. */}
      <SheetPanel title={t(p.title.k, p.title.d)} onClose={() => close(false)}>
      <View style={s.wrap}>
        <View style={[s.icon, { backgroundColor: COLORS.primary + '1a' }]}>
          <Ionicons name={isCamera ? 'camera-outline' : 'images-outline'} size={26} color={COLORS.primary} />
        </View>

        <Text style={[s.sub, { color: colors.textMuted }]}>{t(p.subtitle.k, p.subtitle.d)}</Text>

        <View style={s.reasons}>
          {p.promises.map((r) => (
            <View key={r.k} style={s.reason}>
              <Ionicons name={r.icon} size={15} color={COLORS.primary} />
              <Text style={[s.reasonText, { color: colors.textSecondary }]}>{t(r.k, r.d)}</Text>
            </View>
          ))}
        </View>

        {/*
          We are only here because the plain request already failed, so the
          system has either been declined once (ask again) or has stopped
          asking (Settings). Both need saying — "open settings" on a first
          decline sends people somewhere they did not need to go.
        */}
        <Text style={[s.why, { color: '#f59e0b' }]}>
          {isCamera
            ? t('perm.blocked', 'Camera access is turned off for this app.')
            : t('perm.blockedLibrary', 'Photo access is turned off for this app.')}
        </Text>

        <TouchableOpacity
          style={s.primary}
          onPress={() => { Linking.openSettings(); close(false); }}
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={17} color={COLORS.white} />
          <Text style={s.primaryText}>{t('perm.openSettings', 'Open settings')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondary} onPress={() => close(false)} accessibilityRole="button">
          <Text style={[s.secondaryText, { color: colors.textMuted }]}>{t(p.cancel.k, p.cancel.d)}</Text>
        </TouchableOpacity>
      </View>
      </SheetPanel>
    </BlurSheet>
  );
}

const s = StyleSheet.create({
  wrap: { padding: SPACING.lg, alignItems: 'center' },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold as any, textAlign: 'center' },
  sub: { fontSize: FONT_SIZE.sm, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  reasons: { width: '100%', gap: SPACING.sm, marginTop: SPACING.lg },
  reason: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  reasonText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 19 },
  why: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.lg },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 99, height: 50, width: '100%', marginTop: SPACING.sm,
  },
  primaryText: { color: COLORS.white, fontSize: FONT_SIZE.base, fontWeight: '700' },
  secondary: { paddingVertical: SPACING.md },
  secondaryText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any },
});
