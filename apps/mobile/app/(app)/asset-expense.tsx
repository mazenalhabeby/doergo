import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';

import { DateField } from '../../src/components';
import { EquipmentFrame, useFormPalette } from '../../src/components/equipment/equipment-frame';
import { forgetHeldAssets } from '../../src/hooks/use-held-assets';
import { EquipmentPicker } from '../../src/components/equipment/equipment-picker';
import { CaptureReviewFoot } from '../../src/components/equipment/capture-review';
import { CaptureCamera, CaptureSkip } from '../../src/components/equipment/capture-camera';
import { useEntryDayBounds } from '../../src/hooks/use-entry-day-bounds';
import { assetEntryDateText, dayKeyOf, occurredAtForDay } from '../../src/lib/log-dates';
import { documentPicker } from '../../src/lib/optional-native';
import { useToast } from '../../src/island/island-context';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { canScanReceipts, scanReceipt } from '../../src/lib/receipt-scan';
import { assetsApi, uploadToPresignedUrl, type HeldAsset } from '../../src/lib/api';
import { normalizeKindShape, categoryForReceipt, moneyToCents, type KindMoneyCategory, type ParsedReceipt, fromCents } from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../src/lib/constants';
import { useOffline } from '../../src/offline/offline-context';
import { submitExpenseFromPhone } from '../../src/offline/assets/expense-actions';

/**
 * File what I just spent, at the pump, in about fifteen seconds.
 *
 * Three states in one screen — choose, photograph, check — because the last is
 * a REVIEW of the one before it and "back" has to return to the camera, not to
 * the list. The same reason the card scanner is one route.
 *
 * ⚠️ Nothing is sent without the person seeing it. What the reader could PROVE
 * (a figure on a line that says "Total") is marked read; what it GUESSED (the
 * biggest number it could find) is marked as needing a look. A receipt has no
 * check digit, and an OCR reading 8 as 3 is not a rare event — the amount is
 * money, and it is the number nobody re-reads once it looks plausible.
 *
 * ⚠️ And the photograph is deleted the moment it has been uploaded or has
 * failed. It is a picture of somebody's card slip; leaving it in a cache
 * directory with no expiry undoes the point of reading it on the device.
 */

type Stage = 'camera' | 'review';

/**
 * Opened from a home shortcut there is no equipment in the link: ask which one
 * first (or go straight to the only one) instead of "You do not have this one".
 */
export default function AssetExpenseScreenRoute() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  return assetId ? <AssetExpenseScreen /> : <EquipmentPicker what="expense" />;
}

function AssetExpenseScreen() {
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
  const occurredAtIso = useCallback(
    () => (occurredAtForDay(when, new Date()) ?? new Date()).toISOString(),
    [when],
  );
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
      } catch (e: any) {
        if (alive) toast.error(e?.message || t('expenses.loadFailed', 'Could not open that'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [assetId, t, toast]);

  /** Whatever the reader worked out, dropped into the form. */
  const applyRead = useCallback((receipt: ParsedReceipt) => {
    setRead(receipt);
    if (receipt.totalCents) setAmount(fromCents(receipt.totalCents.value).toFixed(2));
    if (receipt.date) setWhen(receipt.date.value);
    if (receipt.vendor) setNote(receipt.vendor.value);
    const guess = categoryForReceipt(receipt, spendCategories);
    setCategory(guess?.label ?? spendCategories[0]?.label ?? '');
  }, [spendCategories]);

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

  const discardShot = useCallback(() => {
    // Whatever was uploaded belongs to the file being discarded; keeping the
    // key would attach the old PDF to the next receipt.
    setUploadedKey(null);
    if (!shot) return;
    try { new FsFile(shot.uri).delete(); } catch { /* already gone */ }
    setShot(null);
  }, [shot]);

  const cents = moneyToCents(amount);

  const send = useCallback(async () => {
    if (!cents || !category) return;
    /*
      A date read off the slip is set without the calendar being opened, so an
      old receipt photographed today reaches here unchecked. Said now, in the
      logbook's words, rather than after a round trip on one bar of signal.
    */
    if (dateProblem) {
      toast.error(dateProblem);
      return;
    }
    setSending(true);
    let receiptKey: string | undefined;
    try {
      if (offline.engine && offline.files) {
        // Saved on the phone with its receipt; both send themselves.
        const outcome = await submitExpenseFromPhone(offline.engine, offline.files, {
          assetId, category, amountCents: cents, note: note.trim() || undefined,
          occurredAt: occurredAtIso(),
          photo: shot ? { uri: shot.uri, mime: shot.mime } : null,
          uploadedKey,
        });
        if (outcome.kind === 'refused') {
          toast.error((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('expenses.sendFailed', 'Could not send it'));
          return;
        }
        toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('expenses.sent', 'Sent — the office will confirm it.'));
        discardShot();
        forgetHeldAssets(); // the profile's count and list read this again
        router.back();
        return;
      }
      /*
        The slip goes phone → S3 directly. Presigned for THIS asset under a
        prefix that names the organization, and the submit step refuses a key
        outside it — so a key from anywhere else cannot be attached here.

        An upload that fails does NOT stop the expense. The amount and the date
        are what the books need; the photograph is evidence, and losing it to a
        motorway signal must not cost somebody the entry as well.
      */
      if (uploadedKey) {
        /*
          A PDF went up already — it had to, or the server could not have read
          it. Uploading again would put a second identical object in the bucket
          that nothing points at, and pay for the transfer twice on a phone.
        */
        receiptKey = uploadedKey;
      } else if (shot) {
        try {
          const presign = await assetsApi.presignReceipt(assetId, {
            fileName: `receipt-${Date.now()}.jpg`,
            mimeType: shot.mime,
            occurredAt: occurredAtIso(),
          });
          await uploadToPresignedUrl(presign.uploadUrl, shot.uri, shot.mime);
          receiptKey = presign.fileKey;
        } catch {
          toast.info(t('expenses.photoFailed', 'The photo did not upload — sending the amount anyway.'));
        }
      }

      await assetsApi.submitExpense(assetId, {
        category,
        amountCents: cents,
        note: note.trim() || undefined,
        occurredAt: occurredAtIso(),
        receiptKey,
        receiptName: receiptKey ? 'receipt.jpg' : undefined,
        receiptMime: receiptKey ? shot?.mime : undefined,
      });

      toast.success(t('expenses.sent', 'Sent — the office will confirm it.'));
      discardShot();
      forgetHeldAssets(); // the profile's count and list read this again
      router.back();
    } catch (e: any) {
      toast.error(e?.message || t('expenses.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
  }, [cents, category, dateProblem, shot, assetId, occurredAtIso, note, discardShot, t, toast, offline.engine, offline.files, uploadedKey]);

  // ── Is this mine at all? ──────────────────────────────────────────────────
  if (loading) {
    return (
      <EquipmentFrame title={t('expenses.title', 'Add a receipt')}>
        <View style={s.centre}><ActivityIndicator color={COLORS.primary} /></View>
      </EquipmentFrame>
    );
  }
  if (!held) {
    /*
      A route is reachable by deep link whether or not a button points at it.
      The server refuses regardless — custody is checked there — but letting
      somebody photograph a slip and only then be refused wastes their time.
    */
    return (
      <EquipmentFrame title={t('expenses.title', 'Add a receipt')}>
        <View style={s.centre}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t('expenses.notYours', 'You do not have this one.')}
          </Text>
        </View>
      </EquipmentFrame>
    );
  }

  // ── Camera permission ─────────────────────────────────────────────────────
  if (stage === 'camera' && !cam.granted) {
    return (
      <EquipmentFrame title={t('expenses.title', 'Add a receipt')}>
        <MediaAccessScreen
          purpose="receipt"
          access={cam}
          onCancel={() => setStage('review')}
        />
      </EquipmentFrame>
    );
  }

  // ── Check before sending ──────────────────────────────────────────────────
  if (stage === 'review') {
    return (
      <EquipmentFrame title={t('expenses.review', 'Check before sending')} onBack={() => { discardShot(); setStage('camera'); }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}>
          <Text style={[s.asset, { color: colors.textMuted }]} numberOfLines={1}>
            {held.asset?.name ?? ''}
          </Text>

          <Field
            colors={colors}
            label={t('expenses.amount', 'Amount')}
            /* Read, or guessed? The distinction IS the safety here: a total the
               slip labelled is a fact, and the biggest figure the reader could
               find is a suggestion that has to be looked at. */
            certain={read?.totalCents?.confidence === 'certain'}
            unknown={!read?.totalCents}
            t={t}
          >
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              style={[s.input, s.amountInput, { color: colors.textPrimary }]}
            />
          </Field>

          <Field
            colors={colors}
            label={t('expenses.date', 'Date')}
            certain={read?.date?.confidence === 'certain'}
            unknown={!read?.date}
            t={t}
          >
            {/* The logbook's calendar, greying out the days the server refuses. */}
            <DateField
              value={when}
              onChange={(v) => v && setWhen(v)}
              minDate={bounds.minDate}
              maxDate={bounds.maxDate}
              title={t('expenses.date', 'Date')}
              invalid={!!dateProblem}
            />
            {/* A date read off an old slip lands outside the calendar's days; say so beside it. */}
            {dateProblem && <Text style={s.dateProblem}>{dateProblem}</Text>}
          </Field>

          <Text style={[s.label, { color: colors.textMuted }]}>{t('expenses.category', 'What for')}</Text>
          <View style={s.chips}>
            {spendCategories.map((c) => (
              <TouchableOpacity
                key={c.label}
                onPress={() => setCategory(c.label)}
                style={[
                  s.chip,
                  { borderColor: colors.border },
                  category === c.label && { backgroundColor: `${COLORS.primary}1a`, borderColor: COLORS.primary },
                ]}
              >
                <Text style={{
                  fontSize: FONT_SIZE.sm,
                  color: category === c.label ? COLORS.primary : colors.textPrimary,
                  fontWeight: category === c.label ? '700' : '400',
                }}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.lg }]}>
            {t('expenses.note', 'Note')}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('expenses.notePh', 'Where, or what for')}
            placeholderTextColor={colors.textMuted}
            style={[s.input, s.boxed, { color: colors.textPrimary, borderColor: colors.border }]}
          />

          <CaptureReviewFoot
            shot={!!shot}
            icon="image"
            attachedLabel={t('expenses.photoAttached', 'Photo attached')}
            missingLabel={t('expenses.noPhoto', 'No photo')}
            onRetake={() => { discardShot(); setStage('camera'); }}
            onSend={send}
            sendDisabled={sending || !cents || !category}
            ready={!!(cents && category)}
            sending={sending}
            sendLabel={t('expenses.send', 'Send it in')}
            sendLabelColor={COLORS.onPrimary}
            footnote={t('expenses.pendingHint', 'It counts once the office accepts it.')}
            primary={COLORS.primary}
            border={colors.border}
            muted={colors.textMuted}
          />
        </ScrollView>
      </EquipmentFrame>
    );
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  return (
    <CaptureCamera
      cameraRef={camera}
      title={held.asset?.name ?? ''}
      hint={t('expenses.aim', 'Get the whole slip in shot')}
      onCapture={capture}
      busy={busy}
    >
      {/*
        Two ways in, and the camera is still the primary one — it is what a
        driver at a pump has. "Choose a file" is for the invoice that
        arrived by email, which is the only way a PDF ever gets here.
      */}
      <CaptureSkip label={t('expenses.chooseFile', 'Choose a file')} onPress={pickFile} disabled={busy} />
      <CaptureSkip label={t('expenses.typeInstead', 'Type it instead')} onPress={() => setStage('review')} />
    </CaptureCamera>
  );
}

/** One value, with how confident the reader is about it. */
function Field({
  colors, label, certain, unknown, t, children,
}: {
  colors: any; label: string; certain: boolean; unknown: boolean; t: any; children: React.ReactNode;
}) {
  const border = unknown ? colors.border : certain ? 'rgba(22,163,74,.45)' : 'rgba(245,158,11,.5)';
  return (
    <View style={[s.field, { borderColor: border }]}>
      <View style={s.fieldHead}>
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        {!unknown && (
          <Text style={[s.badge, certain ? s.badgeOk : s.badgeCheck]}>
            {certain ? t('scan.found', 'FOUND') : t('scan.check', 'CHECK')}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  asset: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },


  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' },
  badgeOk: { color: '#4ade80', backgroundColor: 'rgba(22,163,74,.16)' },
  badgeCheck: { color: '#fbbf24', backgroundColor: 'rgba(245,158,11,.16)' },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  amountInput: { fontSize: 26, fontWeight: '700' },
  dateProblem: { color: COLORS.error, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
  boxed: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10 },

  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: SPACING.md, paddingVertical: 8 },

});
