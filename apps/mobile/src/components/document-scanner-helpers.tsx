import { View, StyleSheet, Image, Dimensions } from 'react-native';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { type ScanShape, type Rect } from '@hbcfield/shared/client';
import { frameRect } from './use-document-scanner';

/** DocumentScanner's module-level helpers, moved here unchanged so its sections can read them too. */
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
export const DOCUMENT_BARCODES = ['pdf417', 'datamatrix'] as const;

/**
 * The framed rectangle of a photograph, without touching the pixels.
 *
 * An oversized image inside a clipped box, offset so the crop is what shows.
 * It costs nothing, needs no native module, and — the reason it matters — it
 * is computed from THE SAME rectangle the server will cut, so if the mapping is
 * wrong the person sees it is wrong before they send it.
 */
export function CropPreview({ shot }: { shot: { uri: string; crop?: Rect; width: number; height: number } }) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const crop = shot.crop;

  if (!crop || !shot.width || !shot.height) {
    return <Image source={{ uri: shot.uri }} style={s.fill} resizeMode="contain" />;
  }

  const cropRatio = (crop.width * shot.width) / (crop.height * shot.height);
  // Fit the crop into the space above the buttons, by whichever side binds.
  const available = { width: screenWidth, height: screenHeight * 0.62 };
  const boxWidth = Math.min(available.width, available.height * cropRatio);
  const boxHeight = boxWidth / cropRatio;

  const fullWidth = boxWidth / crop.width;
  const fullHeight = fullWidth * (shot.height / shot.width);

  return (
    <View style={s.cropStage}>
      <View style={[s.cropBox, { width: boxWidth, height: boxHeight }]}>
        <Image
          source={{ uri: shot.uri }}
          style={{
            position: 'absolute',
            width: fullWidth,
            height: fullHeight,
            left: -crop.left * fullWidth,
            top: -crop.top * fullHeight,
          }}
        />
      </View>
    </View>
  );
}

/**
 * The cut-out.
 *
 * Four dimmed bars around a clear rectangle rather than a semi-transparent
 * overlay with a hole, which React Native cannot express without masking. The
 * corner brackets are what a person actually aims with.
 */
export function Frame({ shape }: { shape: ScanShape }) {
  const { width, height } = Dimensions.get('window');
  // The SAME calculation the crop uses. Two of them would drift.
  const { left, top, width: frameWidth, height: frameHeight } =
    frameRect(shape, { width, height });

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

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  cropStage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  cropBox: { overflow: 'hidden', borderRadius: RADIUS.md, backgroundColor: '#111' },
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
