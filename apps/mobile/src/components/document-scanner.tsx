import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, Image, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { File as FsFile } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { PressableScale } from './pressable-scale';
import { scanAspect, type ScanShape } from '@hbcfield/shared/client';

/**
 * Scanning a document, rather than photographing one.
 *
 * The difference is not cosmetic. The OS photo picker produces a picture of a
 * card somewhere on a table, at an angle, with a thumb across a corner — and
 * every downstream check is then working against a bad image. Every serious
 * identity flow uses a guided capture instead, and the guidance is the product:
 *
 *   A FRAME THE DOCUMENT FITS — the RIGHT frame. ID-1 (85.6 × 54) for a card,
 *   ID-3 (125 × 88) for a passport page, A4 upright for a paper certificate.
 *   This is not decoration: a document held to fit the wrong frame sits further
 *   from the lens, and how many pixels the machine-readable zone occupies is
 *   what decides whether it can be read at all. A passport squeezed into a card
 *   frame is a smaller zone and a worse read.
 *
 *   ONE INSTRUCTION AT A TIME, in the same place. "Fit the front of the card in
 *   the frame" — then, for a two-sided document, "now turn it over". A list of
 *   rules before the camera opens is a list nobody reads.
 *
 *   AUTOMATIC WHERE IT CAN BE. A driving licence with a PDF417 barcode is read
 *   the instant it enters the frame, with no shutter press and no OCR — the
 *   data comes off the document exactly, not approximately.
 *
 *   THE PICTURE IS KEPT EITHER WAY. The barcode is a bonus; the image is the
 *   record, because a reviewer still has to see the face on the card.
 *
 * What this deliberately does NOT claim: it does not say the image is sharp or
 * glare-free. Judging that needs frame analysis this stack cannot do on-device,
 * and a "quality: good" badge that is really a guess would be worse than
 * silence — it would move the blame for an unreadable photo onto the app's own
 * reassurance.
 */

/** Barcodes that carry document data. Not QR: nothing prints one on a licence. */
const DOCUMENT_BARCODES = ['pdf417', 'datamatrix'] as const;

export interface ScannedDocument {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** The back of a two-sided card, when one was taken. */
  backUri?: string;
  /** Exactly as the barcode encoded it. Parsed and CHECKED on the server. */
  barcodeData?: string;
  barcodeType?: string;
}

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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [side, setSide] = useState<'front' | 'back'>('front');
  const [front, setFront] = useState<{ uri: string; size: number } | null>(null);
  const [preview, setPreview] = useState<{ uri: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);

  // Held in a ref, not state: a barcode fires many times a second and each
  // re-render would restart the camera preview.
  const barcode = useRef<{ data: string; type: string } | null>(null);
  const capturing = useRef(false);

  useEffect(() => {
    if (!visible) {
      setSide('front');
      setFront(null);
      setPreview(null);
      setTorch(false);
      barcode.current = null;
      capturing.current = false;
    }
  }, [visible]);

  const measure = (uri: string): number => {
    try {
      return new FsFile(uri).size ?? 0;
    } catch {
      return 0;
    }
  };

  const capture = useCallback(async () => {
    // Guarded: the shutter and the barcode auto-capture race each other, and
    // two captures leave a second file nobody uses.
    if (!camera.current || capturing.current) return;
    capturing.current = true;
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (shot?.uri) setPreview({ uri: shot.uri, size: measure(shot.uri) });
    } finally {
      setBusy(false);
      capturing.current = false;
    }
  }, []);

  const onBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (barcode.current || capturing.current) return;
      barcode.current = { data: result.data, type: result.type };
      // The document is in frame and square enough to decode — the best moment
      // to take the picture, and better than any moment a person picks.
      void capture();
    },
    [capture],
  );

  const accept = () => {
    if (!preview) return;
    if (twoSided && side === 'front') {
      setFront(preview);
      setPreview(null);
      setSide('back');
      return;
    }
    const first = twoSided ? front! : preview;
    onDone({
      uri: first.uri,
      fileName: `document_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: first.size,
      backUri: twoSided ? preview.uri : undefined,
      barcodeData: barcode.current?.data,
      barcodeType: barcode.current?.type,
    });
  };

  if (!visible) return null;

  // ── Permission ────────────────────────────────────────────────────────────
  if (permission && !permission.granted) {
    return (
      <Modal visible transparent={false} animationType="slide" onRequestClose={onCancel}>
        <View style={[s.permission, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <Ionicons name="camera-outline" size={48} color={colors.textSecondary} />
          <Text style={[s.permissionTitle, { color: colors.textPrimary }]}>
            {t('documents.scanner.cameraNeeded')}
          </Text>
          <Text style={[s.permissionBody, { color: colors.textSecondary }]}>
            {t('documents.scanner.cameraWhy')}
          </Text>
          <PressableScale onPress={requestPermission} style={[s.primary, { backgroundColor: COLORS.primary }]}>
            <Text style={s.primaryText}>{t('documents.scanner.allowCamera')}</Text>
          </PressableScale>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={[s.link, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
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
            <Image source={{ uri: preview.uri }} style={s.fill} resizeMode="contain" />
            <View style={[s.previewBar, { paddingBottom: insets.bottom + SPACING.lg }]}>
              <Text style={s.previewAsk}>
                {t(twoSided && side === 'front' ? 'documents.scanner.frontReadable' : 'documents.scanner.readable')}
              </Text>
              <View style={s.previewActions}>
                <PressableScale onPress={() => setPreview(null)} style={[s.secondary]}>
                  <Ionicons name="refresh" size={18} color="#fff" />
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
              barcodeScannerSettings={{ barcodeTypes: [...DOCUMENT_BARCODES] }}
              onBarcodeScanned={onBarcode}
            />

            <Frame shape={shape} />

            <View style={[s.top, { paddingTop: insets.top + SPACING.sm }]}>
              <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Text style={s.title} numberOfLines={1}>{title}</Text>
              <Pressable onPress={() => setTorch((v) => !v)} hitSlop={12} accessibilityRole="button">
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={24} color="#fff" />
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
              <Text style={s.instructionHint}>{t('documents.scanner.autoHint')}</Text>
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

/**
 * The cut-out.
 *
 * Four dimmed bars around a clear rectangle rather than a semi-transparent
 * overlay with a hole, which React Native cannot express without masking. The
 * corner brackets are what a person actually aims with.
 */
function Frame({ shape }: { shape: ScanShape }) {
  const { width, height } = Dimensions.get('window');
  const aspect = scanAspect(shape);

  /*
    Fit by whichever dimension runs out first.

    A4 upright is TALLER than it is wide, so sizing from the width alone would
    push the frame off both ends of the screen and leave somebody aiming at a
    rectangle they cannot see.
  */
  const maxWidth = width * 0.88;
  const maxHeight = height * 0.62;
  const frameWidth = Math.min(maxWidth, maxHeight * aspect);
  const frameHeight = frameWidth / aspect;

  const top = (height - frameHeight) / 2 - height * 0.04;
  const left = (width - frameWidth) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[s.dim, { top: 0, left: 0, right: 0, height: top }]} />
      <View style={[s.dim, { top: top + frameHeight, left: 0, right: 0, bottom: 0 }]} />
      <View style={[s.dim, { top, left: 0, width: left, height: frameHeight }]} />
      <View style={[s.dim, { top, right: 0, width: left, height: frameHeight }]} />

      <View style={{ position: 'absolute', top, left, width: frameWidth, height: frameHeight }}>
        <View style={[s.corner, s.tl]} />
        <View style={[s.corner, s.tr]} />
        <View style={[s.corner, s.bl]} />
        <View style={[s.corner, s.br]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  fill: { ...StyleSheet.absoluteFillObject },

  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#fff' },
  tl: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: RADIUS.md },
  tr: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: RADIUS.md },
  bl: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: RADIUS.md },
  br: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: RADIUS.md },

  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.md,
  },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  instructionWrap: { position: 'absolute', left: 0, right: 0, bottom: '26%', alignItems: 'center', paddingHorizontal: SPACING.xl },
  instruction: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center' },
  instructionHint: { color: 'rgba(255,255,255,0.7)', fontSize: FONT_SIZE.sm, textAlign: 'center', marginTop: SPACING.xs },

  shutterBar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  shutter: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  previewBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  previewAsk: { color: '#fff', fontSize: FONT_SIZE.md, textAlign: 'center' },
  previewActions: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'stretch' },

  primary: {
    alignItems: 'center', justifyContent: 'center',
    minHeight: 52, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl,
  },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    minHeight: 52, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  secondaryText: { color: '#fff', fontSize: FONT_SIZE.md },

  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  permissionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, textAlign: 'center' },
  permissionBody: { fontSize: FONT_SIZE.md, textAlign: 'center', lineHeight: 22 },
  link: { fontSize: FONT_SIZE.md, marginTop: SPACING.sm },
});
