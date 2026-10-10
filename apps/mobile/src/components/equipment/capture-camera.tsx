import type { ReactNode, RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SPACING, FONT_SIZE } from '../../lib/constants';

/**
 * The full-bleed camera of a "photograph it and send it in" screen — a receipt
 * (`asset-expense`) or an agreement (`send-document`): close at the top, a
 * line on what to aim at, the other ways in as quiet pills, the shutter.
 * Both screens drew it in full.
 *
 * No frame on purpose: a receipt is a strip of any proportion and a page may
 * be any shape, and a rectangle nobody can fill teaches people the scan is
 * broken.
 */
export function CaptureCamera({
  cameraRef,
  title,
  hint,
  wideHint = false,
  onCapture,
  busy,
  children,
}: {
  cameraRef: RefObject<CameraView | null>;
  /** Centred between the close button and a matching spacer; no title row when omitted. */
  title?: string;
  hint: string;
  /** A hint that may run to two lines: padded in from the edges and centred. */
  wideHint?: boolean;
  onCapture: () => void;
  busy: boolean;
  /** The other ways in, above the shutter — `CaptureSkip`s. */
  children: ReactNode;
}) {
  return (
    <View style={s.black}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={title !== undefined ? [s.camHead, s.camHeadTitled] : s.camHead}>
          <TouchableOpacity onPress={() => router.back()} style={s.camBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {title !== undefined ? (
            <>
              <Text style={s.camTitle} numberOfLines={1}>{title}</Text>
              <View style={s.camBtn} />
            </>
          ) : null}
        </View>

        <View style={wideHint ? [s.camMid, s.camMidWide] : s.camMid} pointerEvents="none">
          <Text style={wideHint ? [s.camHint, s.camHintWide] : s.camHint}>{hint}</Text>
        </View>

        <View style={s.camFoot}>
          {children}
          <TouchableOpacity onPress={onCapture} disabled={busy} style={s.shutter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** A quiet way in on the camera — "Type it instead", "Choose a file". */
export function CaptureSkip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={s.skip}>
      <Text style={s.skipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  camHead: { flexDirection: 'row', padding: SPACING.md },
  camHeadTitled: { alignItems: 'center' },
  camBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  camTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: FONT_SIZE.base, fontWeight: '600' },
  camMid: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: SPACING.xl },
  camMidWide: { paddingHorizontal: SPACING.xl },
  camHint: { color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  camHintWide: { textAlign: 'center' },
  /* ⚠️ `marginTop: 'auto'` is what keeps the shutter at the bottom — the same
     trap the card scanner documents: without it the foot rides up under the
     close button on a real phone. */
  camFoot: { marginTop: 'auto', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.xl },
  skip: { paddingVertical: 6, paddingHorizontal: SPACING.lg, borderRadius: 99, backgroundColor: 'rgba(0,0,0,.45)' },
  skipText: { color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
});
