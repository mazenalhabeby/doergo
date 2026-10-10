import type { RefObject } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CARD_FRAMES } from '../../lib/card-scan';
import { SPACING, FONT_SIZE } from '../../lib/constants';

/** The first state of the scanner: the viewfinder, the card frame, the shutter. */
export function CardCamera({ camera, setBox, frame, busy, progress, capture }: {
  camera: RefObject<CameraView | null>;
  setBox: (update: (p: { width: number; height: number }) => { width: number; height: number }) => void;
  frame: { left: number; top: number; width: number; height: number };
  busy: boolean;
  progress: number;
  capture: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={s.black}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((p) => (p.width === width && p.height === height ? p : { width, height }));
      }}
    >
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={s.camHead}>
          <TouchableOpacity onPress={() => router.back()} style={s.camBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* A card-shaped frame: 85×55mm is the standard, so the guide is the
            shape of the thing rather than a generic rectangle. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[s.guide, { left: frame.left, top: frame.top, width: frame.width, height: frame.height }]} />
          <Text style={[s.guideHint, { top: frame.top + frame.height + 16 }]}>
            {/* Honest progress while several looks are taken — see `progress`.
                "Hold still" is the one instruction that actually helps, and it
                is true: the merge wants a card that stays put. */}
            {busy
              ? t('scan.reading', { done: Math.max(progress, 1), total: CARD_FRAMES })
              : t('scan.frame', 'Fit the card inside the frame')}
          </Text>
        </View>

        <View style={s.camFoot}>
          <TouchableOpacity onPress={capture} disabled={busy} style={s.shutter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },

  camHead: { flexDirection: 'row', padding: SPACING.md },
  camBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  // Positioned from the computed frame, so what is drawn is what is cropped.
  guide: { position: 'absolute', borderWidth: 2, borderColor: '#22c55e', borderRadius: 12 },
  guideHint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  /* ⚠️ `marginTop: 'auto'` is what puts the shutter at the BOTTOM.
     The card guide between the head and the foot is absolutely
     positioned, so it takes up no space in the column — without this
     the foot rides straight up under the close button, which is where
     the shutter was found sitting on a real phone. */
  camFoot: { marginTop: 'auto', alignItems: 'center', paddingBottom: SPACING.xl },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
});
