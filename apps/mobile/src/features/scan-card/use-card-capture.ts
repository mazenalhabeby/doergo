import { useCallback, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { CameraView } from 'expo-camera';
import type { TFunction } from 'i18next';
import { File as FsFile } from 'expo-file-system';
import { frameToImageCrop } from '@hbcfield/shared/client';
import {
  readCardLines, parseCardPasses, wantsAnotherFrame, frameGapAfter, CARD_FRAME_BUDGET_MS,
  type ParsedCard, type CardLine, type CardReadQuality,
} from '@/lib/card-scan';

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * The camera half of the scanner: the frame, the looks, the merge.
 *
 * Hands the merged read to `onRead` and nothing else — what the screen does
 * with it (the review) is `use-card-review.ts`.
 */
export function useCardCapture({ t, toastError, onRead }: {
  t: TFunction;
  /** The toast's stable `error` function — see the note in the screen. */
  toastError: (message: string) => void;
  /** Called once per scan with the union of every look, parsed once. */
  onRead: (card: ParsedCard, quality: CardReadQuality) => void;
}) {
  const window = useWindowDimensions();

  /*
    The frame is measured against the CAMERA'S OWN BOX, not the window.

    They are the same only while the screen is genuinely full-bleed, and it was
    not: an unregistered route inherited the stack header, so a bar sat over the
    top of the viewfinder and the camera saw ~200px less than the frame maths
    assumed. The frame is drawn in this box and the crop is expressed as a
    fraction of it, so measuring the thing itself cannot drift from what the
    lens has, whatever appears above it later.
  */
  const [box, setBox] = useState({ width: window.width, height: window.height });

  /*
    The frame, computed ONCE and used twice — drawn on screen, and applied to
    what the camera captured.

    The document scanner carries the same warning and it is worth repeating: a
    frame drawn from one calculation and cropped from another is a crop of the
    wrong rectangle. 85:55 is the size of every business card in the world.
  */
  const frame = useMemo(() => {
    const CARD_ASPECT = 85 / 55;
    const width = Math.min(box.width * 0.86, box.height * 0.5 * CARD_ASPECT);
    const height = width / CARD_ASPECT;
    return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
  }, [box.width, box.height]);

  const camera = useRef<CameraView>(null);

  const [busy, setBusy] = useState(false);
  /*
    How many looks have been taken, so the shutter can say so.

    ⚠️ The member is standing in front of somebody holding out a card. A spinner
    that sits for two seconds with nothing to say reads as a hang, and the
    natural response to a hang is a second press — which on a camera screen is a
    second scan. "Reading the card… 2 of 3" costs one line and removes the
    question.
  */
  const [progress, setProgress] = useState(0);

  /**
   * ONE LOOK: photograph, read, delete, hand back the lines.
   *
   * ⚠️ NEVER `skipProcessing: true` here.
   *
   * On Android that returns the frame exactly as the sensor recorded it —
   * landscape, whatever way the phone is held. The preview is portrait, so
   * `shot.width/height` then describe a DIFFERENT orientation from `box`, and
   * `frameToImageCrop` maps the frame onto a rectangle with no relation to what
   * the person aimed at. Nothing throws: the reader is simply handed the wrong
   * third of the photograph, and the screen fills in whatever text happened to
   * be there.
   *
   * It cost a real scan — a card whose name, phone, email and address were all
   * outside the region, leaving only a logo. Processing costs a couple of
   * hundred milliseconds and is what makes the frame mean anything.
   *
   * ⚠️ THE PHOTOGRAPH IS DELETED IN A `finally`, ALWAYS, INCLUDING ON FAILURE
   * AND INCLUDING WHEN NOBODY IS STILL WAITING FOR IT. It is a picture of a
   * named person's phone number and email address, sitting in a cache directory
   * with no expiry and no purpose once the text has been read. The whole point
   * of reading the card on the device is that the card does not travel; leaving
   * the image behind quietly undoes that. The caller may abandon a slow frame
   * (see `capture`) — that is exactly why the deletion lives here and not
   * there.
   *
   * ⚠️ Returns an EMPTY pass rather than throwing. A frame the camera fumbled
   * must cost the scan that frame, not the whole card; `mergeCardPasses` skips
   * an empty pass, so one bad look out of three changes nothing.
   */
  const captureFrame = useCallback(async (): Promise<CardLine[]> => {
    let shotUri: string | null = null;
    try {
      const shot = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) return [];
      shotUri = shot.uri;
      const image = { width: shot.width ?? 0, height: shot.height ?? 0 };
      return await readCardLines(shot.uri, image, frameToImageCrop({ frame, screen: box, image }));
    } catch {
      return [];
    } finally {
      if (shotUri) {
        try { new FsFile(shotUri).delete(); } catch { /* already gone */ }
      }
    }
    /*
      ⚠️ `box`, not `screen`. There is no `screen` in this component — it was
      renamed to `window` when the frame started being measured against the
      CAMERA's box, and this dependency array was the one use that did not get
      renamed with it.

      TypeScript could not catch it: `expo/tsconfig.base` sets
      `lib: ["DOM", "ESNext"]`, so `screen` is a perfectly good global as far as
      the compiler is concerned. At runtime it does not exist, so opening the
      scanner threw "Property 'screen' doesn't exist" before a frame was drawn.
    */
  }, [frame, box]);

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setProgress(0);
    const started = Date.now();
    const passes: CardLine[][] = [];
    try {
      /*
        THE FIRST LOOK IS ALWAYS AWAITED IN FULL. It is the whole answer if the
        others fail, so it is the one frame the budget below may not cut short.
      */
      const first = Date.now();
      passes.push(await captureFrame());
      setProgress(1);
      let lastFrameMs = Date.now() - first;

      while (wantsAnotherFrame(passes.length, Date.now() - started)) {
        // Only as much pause as the last frame did not already provide — see
        // `frameGapAfter`. A card sitting still in front of a moving hand is a
        // different picture within a quarter of a second either way.
        const gap = frameGapAfter(lastFrameMs);
        if (gap > 0) await wait(gap);

        const left = CARD_FRAME_BUDGET_MS - (Date.now() - started);
        if (left <= 0) break;
        /*
          ⚠️ RACED AGAINST WHAT IS LEFT, never simply awaited. The member is
          holding a card out in front of a camera; one slow frame must cost the
          scan that frame and not the member's patience. The abandoned capture
          is not leaked — `captureFrame` deletes its own photograph in a
          `finally`, so the file goes whenever it settles, with or without
          anybody waiting for it.
        */
        const at = Date.now();
        const lines = await Promise.race([
          captureFrame(),
          wait(left).then(() => null),
        ]);
        lastFrameMs = Date.now() - at;
        if (!lines) break;
        passes.push(lines);
        setProgress(passes.length);
      }

      // ⚠️ Parsed ONCE, on the union. See `parseCardPasses`.
      const { card: parsed, quality } = parseCardPasses(passes);
      if (parsed.lines.length === 0) {
        toastError(t('scan.nothingRead', 'Nothing could be read — try again with more light.'));
        return;
      }

      onRead(parsed, quality);
    } catch {
      toastError(t('scan.failed', 'Could not read the card.'));
    } finally {
      setBusy(false);
    }
  }, [busy, t, toastError, captureFrame, onRead]);

  return { camera, box, setBox, frame, busy, progress, capture };
}
