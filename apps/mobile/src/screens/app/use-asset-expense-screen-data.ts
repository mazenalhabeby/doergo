import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFormPalette } from '../../components/equipment/equipment-frame';
import { useEntryDayBounds } from '../../hooks/use-entry-day-bounds';
import { assetEntryDateText, dayKeyOf, occurredAtForDay } from '../../lib/log-dates';
import { documentPicker } from '../../lib/optional-native';
import { useToast } from '../../island/island-context';
import { useCameraAccess } from '../../permissions/use-media-access';
import { canScanReceipts, scanReceipt } from '../../lib/receipt-scan';
import { assetsApi, uploadToPresignedUrl, type HeldAsset } from '../../lib/api';
import {
  normalizeKindShape,
  categoryForReceipt,
  type KindMoneyCategory,
  type ParsedReceipt,
  fromCents,
} from '@hbcfield/shared/client';
import { useOffline } from '../../offline/offline-context';
import { caught } from '../../lib/caught';

export type Stage = 'camera' | 'review';

/** useAssetExpenseScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetExpenseScreenData() {
  const { colors, COLORS } = useFormPalette();
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, d: string, o?: Record<string, unknown>) => string;
  const toast = useToast();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ assetId?: string }>();
  const assetId = typeof params.assetId === 'string' ? params.assetId : '';

  const cam = useCameraAccess();
  const camera = useRef<CameraView>(null);

  const [held, setHeld] = useState<HeldAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('camera');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  /** The photograph, kept only until it is uploaded — then deleted. */
  const [shot, setShot] = useState<{ uri: string; mime: string } | null>(null);
  /*
    A PDF is uploaded BEFORE the amount is typed, because the server has to see
    it to read it. Remembering the key stops the submit sending the same bytes a
    second time — and a second object in the bucket that nothing points at.
  */
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [read, setRead] = useState<ParsedReceipt | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('');
  /*
    A LOCAL day. `toISOString().slice(0, 10)` answered yesterday after midnight
    anywhere east of Greenwich, and `new Date("2026-09-10")` is UTC midnight —
    the evening of the 9th west of it, which is the instant custody was asked
    of. Both are gone: the day is picked on the logbook's calendar and filed by
    the logbook's rule (shared `assets/entry-date.ts`).
  */
  const [when, setWhen] = useState<string>(() => dayKeyOf(new Date()));
  /* The same window the logbook offers and the server refuses by. */
  const { canManageAssets, bounds } = useEntryDayBounds();
  /** What the server is sent for the chosen day — now for today, local midday before. */
  const occurredAtIso = useCallback(() => (occurredAtForDay(when, new Date()) ?? new Date()).toISOString(), [when]);
  const dateProblem = assetEntryDateText(tt, when, { canManageAssets });

  const shape = useMemo(() => normalizeKindShape(held?.asset?.category?.config), [held]);
  const spendCategories = useMemo<KindMoneyCategory[]>(
    () => shape.money.categories.filter((c) => c.direction === 'out'),
    [shape],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { periods } = await assetsApi.mine();
        if (!alive) return;
        // Read from what I HOLD, never fetched by id: this screen must not be
        // a way to look up an asset somebody was not given.
        setHeld(periods.find((h) => h.assetId === assetId) ?? null);
      } catch (e: unknown) {
        if (alive) toast.error(caught(e).message || t('expenses.loadFailed', 'Could not open that'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [assetId, t, toast]);

  /** Whatever the reader worked out, dropped into the form. */
  const applyRead = useCallback(
    (receipt: ParsedReceipt) => {
      setRead(receipt);
      if (receipt.totalCents) setAmount(fromCents(receipt.totalCents.value).toFixed(2));
      if (receipt.date) setWhen(receipt.date.value);
      if (receipt.vendor) setNote(receipt.vendor.value);
      const guess = categoryForReceipt(receipt, spendCategories);
      setCategory(guess?.label ?? spendCategories[0]?.label ?? '');
    },
    [spendCategories],
  );

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      /*
        ⚠️ NEVER `skipProcessing: true`. On Android that hands back the sensor's
        own orientation, which is not the one the preview showed — and while
        this screen crops nothing, the reader's line ORDER comes from the y
        coordinate, and a sideways image turns "top of the slip" into "left of
        the slip". The vendor and the total swap places, silently.
      */
      const picture = await camera.current.takePictureAsync({ quality: 0.7 });
      if (!picture?.uri) return;
      setShot({ uri: picture.uri, mime: 'image/jpeg' });

      if (canScanReceipts()) {
        const { receipt } = await scanReceipt(picture.uri);
        applyRead(receipt);
        if (!receipt.totalCents) {
          toast.info(t('expenses.noTotal', 'Could not find a total — type it in.'));
        }
      }
      setStage('review');
    } catch {
      // The photograph is still worth sending even when the reader failed: the
      // office can read it. Only the convenience is lost.
      toast.error(t('expenses.readFailed', 'Could not read it — check the amount yourself.'));
      setStage('review');
    } finally {
      setBusy(false);
    }
  }, [busy, applyRead, t, toast]);

  /**
   * A file the driver was SENT rather than handed at a counter.
   *
   * ⚠️ A PDF is the one shape the camera path can never open: on-device OCR
   * reads pixels and a PDF has none until something renders it. Yet a PDF is
   * what a supplier emails, which makes it the likeliest form of exactly the
   * invoices worth the most money — and until now the only way to file one was
   * to photograph a screen.
   *
   * So the bytes go up first and the SERVER reads them, off the text layer —
   * which is better than any OCR of the same page, because those are the
   * characters the document was written with rather than a guess at their shape.
   *
   * An image chosen here is read on the device exactly as a photograph is: the
   * local reader is better and costs nothing, and sending it would trade a good
   * answer for a worse one plus a round trip.
   */
  const pickFile = useCallback(async () => {
    if (busy) return;
    /*
      ⚠️ Through the loader, never a top-level import.

      This file imported `expo-document-picker` at module scope, and expo-router
      imports every route while building its tree — so on any binary predating
      the library the throw happened at LAUNCH and this route never registered
      at all. It showed up as `No route named "asset-expense"` in the Metro log
      and a screen that simply did not exist.
    */
    const DocumentPicker = documentPicker();
    if (!DocumentPicker) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0];
    const mime = file.mimeType ?? (file.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    setBusy(true);
    try {
      setShot({ uri: file.uri, mime });

      if (mime !== 'application/pdf') {
        // Same path as the camera: read it here, where it is cheaper and better.
        if (canScanReceipts()) {
          const { receipt } = await scanReceipt(file.uri);
          applyRead(receipt);
          if (!receipt.totalCents) toast.info(t('expenses.noTotal', 'Could not find a total — type it in.'));
        }
        setStage('review');
        return;
      }

      /*
        The upload has to happen anyway, so doing it now costs nothing and is
        what lets the server see the file at all. `fileKey` is remembered so the
        submit does not send the same bytes twice.
      */
      const presigned = await assetsApi.presignReceipt(assetId, {
        fileName: file.name ?? 'receipt.pdf',
        mimeType: 'application/pdf',
        // The same shape the submit sends: the gate reads a DATE, and a bare
        // "2026-09-11" and an instant must not disagree about which day it is.
        occurredAt: occurredAtIso(),
      });
      await uploadToPresignedUrl(presigned.uploadUrl, file.uri, 'application/pdf');
      setUploadedKey(presigned.fileKey);

      const answer = await assetsApi.readReceipt(assetId, {
        fileKey: presigned.fileKey,
        occurredAt: occurredAtIso(),
      });
      if (answer.read) {
        applyRead(answer.receipt);
        if (!answer.receipt.totalCents) toast.info(t('expenses.noTotal', 'Could not find a total — type it in.'));
      } else {
        // A scanned PDF is a photocopy in a wrapper: nothing to read, and
        // inventing a total from nothing is worse than an empty field.
        toast.info(t('expenses.pdfNoText', 'That PDF has no readable text — type the amount.'));
      }
      setStage('review');
    } catch {
      toast.error(t('expenses.readFailed', 'Could not read it — check the amount yourself.'));
      setStage('review');
    } finally {
      setBusy(false);
    }
  }, [busy, assetId, occurredAtIso, applyRead, t, toast]);

  return {
    colors,
    COLORS,
    t,
    toast,
    offline,
    insets,
    assetId,
    cam,
    camera,
    held,
    loading,
    stage,
    setStage,
    busy,
    sending,
    setSending,
    shot,
    setShot,
    uploadedKey,
    setUploadedKey,
    read,
    amount,
    setAmount,
    note,
    setNote,
    category,
    setCategory,
    when,
    setWhen,
    bounds,
    occurredAtIso,
    dateProblem,
    spendCategories,
    capture,
    pickFile,
  };
}
