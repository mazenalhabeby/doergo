import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { File as FsFile } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { useCameraAccess } from '../permissions/use-media-access';
import { scanAspect, frameToImageCrop, type ScanShape, type Rect } from '@hbcfield/shared/client';

export interface ScannedDocument {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /**
   * The back of a two-sided card, with ITS own frame.
   *
   * A European ID card and a driving licence carry the categories and the
   * machine-readable zone here, so this is not a second opinion on the front —
   * for a card it is the half that can actually be read.
   */
  back?: { uri: string; fileSize: number; crop?: Rect };
  /** Exactly as the barcode encoded it. Parsed and CHECKED on the server. */
  barcodeData?: string;
  barcodeType?: string;
  /**
   * The frame, as fractions of the photograph.
   *
   * The camera captures the whole sensor, so without this the frame is only a
   * suggestion to the person holding the phone: what gets filed is a document
   * somewhere on a table, and the reader looks for a machine-readable zone in
   * the lower part of the TABLE.
   */
  crop?: Rect;
}

/**
 * The frame's geometry, in screen points.
 *
 * Computed here rather than inside `Frame` because two things need it and they
 * must agree exactly: the overlay that is drawn, and the crop that is applied
 * to what the camera captured. A frame drawn from one calculation and cropped
 * from another is a crop of the wrong rectangle.
 */
export function frameRect(shape: ScanShape, screen: { width: number; height: number }): Rect {
  const aspect = scanAspect(shape);
  // Fit by whichever dimension runs out first: A4 upright is TALLER than it is
  // wide, and sizing from the width alone would push it off both ends.
  const width = Math.min(screen.width * 0.88, screen.height * 0.62 * aspect);
  const height = width / aspect;
  return {
    left: (screen.width - width) / 2,
    top: (screen.height - height) / 2 - screen.height * 0.04,
    width,
    height,
  };
}

/** DocumentScanner's state and handlers — everything before its markup, moved here unchanged. */
export function useDocumentScanner({
  visible,
  title,
  /** Ask for the reverse as well — ID cards carry the zone on the back. */
  twoSided = false,
  /** The document's real shape. A passport page is not the shape of a card. */
  shape = 'CARD',
  onCancel,
  onDone,
}: Pick<{
  visible: boolean;
  title: string;
  twoSided?: boolean;
  shape?: ScanShape;
  onCancel: () => void;
  onDone: (result: ScannedDocument) => void;
}, 'visible' | 'title' | 'twoSided' | 'shape' | 'onCancel' | 'onDone'>) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const cam = useCameraAccess();
  const camera = useRef<CameraView>(null);

  const [side, setSide] = useState<'front' | 'back'>('front');
  type Shot = { uri: string; size: number; crop?: Rect; width: number; height: number };
  const [front, setFront] = useState<Shot | null>(null);
  const [preview, setPreview] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);

  // Held in a ref, not state: a barcode fires many times a second and each
  // re-render would restart the camera preview.
  const barcode = useRef<{ data: string; type: string; side: 'front' | 'back' } | null>(null);
  // The side on screen, for the barcode callback (a closure would keep the first render's).
  const sideRef = useRef<'front' | 'back'>('front');
  const capturing = useRef(false);

  useEffect(() => {
    if (!visible) {
      setSide('front');
      sideRef.current = 'front';
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
      if (shot?.uri) {
        /*
          Where the frame was, in the picture that was just taken.

          Computed now because it needs the photograph's real dimensions, and
          the preview is a COVER fit — the sensor is 4:3, the screen is not, so
          what the person saw was a centre crop and the frame's share of the
          screen is not its share of the image.
        */
        const screen = Dimensions.get('window');
        setPreview({
          uri: shot.uri,
          size: measure(shot.uri),
          width: shot.width,
          height: shot.height,
          crop: frameToImageCrop({
            frame: frameRect(shape, screen),
            screen,
            image: { width: shot.width, height: shot.height },
          }),
        });
      }
    } finally {
      setBusy(false);
      capturing.current = false;
    }
    // ⚠️ `shape` is a dependency: with none, the crop kept the FIRST type's frame
    // after the member switched from a card to a passport.
  }, [shape]);

  const onBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      // One code per side: a code read on the front used to stop the back from ever auto-capturing.
      if (capturing.current || barcode.current?.side === sideRef.current) return;
      barcode.current = { data: result.data, type: result.type, side: sideRef.current };
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
      sideRef.current = 'back';
      return;
    }
    const first = twoSided ? front! : preview;
    onDone({
      uri: first.uri,
      fileName: `document_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: first.size,
      back: twoSided
        ? { uri: preview.uri, fileSize: preview.size, crop: preview.crop }
        : undefined,
      barcodeData: barcode.current?.data,
      barcodeType: barcode.current?.type,
      crop: first.crop,
    });
  };

  return {
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
  };
}
