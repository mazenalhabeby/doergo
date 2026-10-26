import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, Image, Dimensions } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { File as FsFile } from 'expo-file-system';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { PressableScale } from './pressable-scale';
import { useCameraAccess } from '../permissions/use-media-access';
import { MediaAccessScreen } from '../permissions/media-access-screen';
import { scanAspect, frameToImageCrop, type ScanShape, type Rect } from '@hbcfield/shared/client';
import { useDocumentScanner, frameRect, type ScannedDocument } from './use-document-scanner';
import { DOCUMENT_BARCODES, CropPreview, Frame, s } from './document-scanner-helpers';
export { type ScannedDocument } from './use-document-scanner';

export function DocumentScanner({
  visible,
  title,
  /** Ask for the reverse as well — ID cards carry the zone on the back. */
  twoSided = false,
  /** The document's real shape. A passport page is not the shape of a card. */
  shape = 'CARD',
  onCancel,
  onDone,
}: {
  visible: boolean;
  title: string;
  twoSided?: boolean;
  shape?: ScanShape;
  onCancel: () => void;
  onDone: (result: ScannedDocument) => void;
}) {
  const {
    colors,
    t,
    insets,
    cam,
    camera,
    side,
    preview,
    setPreview,
    busy,
    torch,
    setTorch,
    barcode,
    capture,
    onBarcode,
    accept,
  } = useDocumentScanner({ visible, title, twoSided, shape, onCancel, onDone });

  if (!visible) return null;

  /*
    ── Permission ────────────────────────────────────────────────────────────

    ⚠️ This read `if (permission && !permission.granted)`, and `permission` is
    NULL until the first check resolves — so on every first render the condition
    was false and the code fell straight through to <CameraView>. The camera was
    mounted before anybody knew whether it was allowed.

    `cam.granted` is false for null as well as for a refusal, so the gate now
    holds while the answer is still unknown, which is the only safe default.
    `useCameraAccess` also re-reads on focus, so a permission revoked in
    Settings is noticed on the way back instead of being trusted until restart.
  */
  if (!cam.granted) {
    /*
      The same screen every other scanner shows. This had its own Modal with a
      camera glyph and two lines of text — a second visual language for one
      question, and the only one of the five that did not say what the photo
      was for.
    */
    return (
      <Modal visible transparent={false} animationType="slide" onRequestClose={onCancel}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <MediaAccessScreen purpose="id-document" access={cam} onCancel={onCancel} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onCancel}>
      <View style={s.screen}>
        {preview ? (
          // ── What was captured, before it is used ──────────────────────────
          <>
            {/*
              The CROP, not the photograph.

              What gets filed is the rectangle inside the frame — the camera
              captured a hand and a car seat around it — so asking "is
              everything readable?" over the whole picture asks about an image
              nobody will ever look at. Clipped with layout rather than a real
              crop, because cropping on the device would mean a native module
              and no more over-the-air updates; the server does the actual cut.
            */}
            <CropPreview shot={preview} />
            <View style={[s.previewBar, { paddingBottom: insets.bottom + SPACING.lg }]}>
              <Text style={s.previewAsk}>
                {t(twoSided && side === 'front' ? 'documents.scanner.frontReadable' : 'documents.scanner.readable')}
              </Text>
              <View style={s.previewActions}>
                <PressableScale
                  onPress={() => {
                    // A code read from the discarded shot must not travel with the next one.
                    if (barcode.current?.side === side) barcode.current = null;
                    setPreview(null);
                  }}
                  style={[s.secondary]}
                >
                  <Icon name="refreshLine" size={18} color="#fff" />
                  <Text style={s.secondaryText}>{t('documents.scanner.retake')}</Text>
                </PressableScale>
                <PressableScale onPress={accept} style={[s.primary, { backgroundColor: COLORS.primary, flex: 1 }]}>
                  <Text style={s.primaryText}>
                    {t(twoSided && side === 'front' ? 'documents.scanner.next' : 'documents.scanner.use')}
                  </Text>
                </PressableScale>
              </View>
            </View>
          </>
        ) : (
          // ── The camera, with the frame ────────────────────────────────────
          <>
            <CameraView
              ref={camera}
              style={s.fill}
              facing="back"
              enableTorch={torch}
              /* A paper page carries no code to read — no auto-capture there. */
              barcodeScannerSettings={shape === 'PAGE' ? undefined : { barcodeTypes: [...DOCUMENT_BARCODES] }}
              onBarcodeScanned={shape === 'PAGE' ? undefined : onBarcode}
            />

            <Frame shape={shape} />

            <View style={[s.top, { paddingTop: insets.top + SPACING.sm }]}>
              <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button">
                <Icon name="close" size={28} color="#fff" />
              </Pressable>
              <Text style={s.title} numberOfLines={1}>
                {title}
              </Text>
              <Pressable onPress={() => setTorch((v) => !v)} hitSlop={12} accessibilityRole="button">
                <Icon name={torch ? 'flash' : 'flashOff'} size={24} color="#fff" />
              </Pressable>
            </View>

            {/* One instruction, in one place, changing as the job changes. */}
            <View style={s.instructionWrap} pointerEvents="none">
              <Text style={s.instruction}>
                {t(
                  twoSided
                    ? side === 'front'
                      ? 'documents.scanner.fitFront'
                      : 'documents.scanner.fitBack'
                    : 'documents.scanner.fit',
                )}
              </Text>
              {shape === 'PAGE' ? null : <Text style={s.instructionHint}>{t('documents.scanner.autoHint')}</Text>}
            </View>

            <View style={[s.shutterBar, { paddingBottom: insets.bottom + SPACING.lg }]}>
              <Pressable
                onPress={capture}
                disabled={busy}
                style={s.shutter}
                accessibilityRole="button"
                accessibilityLabel={t('documents.scanner.capture')}
              >
                {busy ? <ActivityIndicator color="#000" /> : <View style={s.shutterInner} />}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
