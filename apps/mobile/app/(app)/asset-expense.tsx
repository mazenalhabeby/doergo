import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { canScanReceipts, scanReceipt } from '../../src/lib/receipt-scan';
import { assetsApi, uploadToPresignedUrl, type HeldAsset } from '../../src/lib/api';
import {
  normalizeKindShape, categoryForReceipt, moneyToCents,
  type KindMoneyCategory, type ParsedReceipt,
} from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

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

export default function AssetExpenseScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
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
  const [when, setWhen] = useState<string>(new Date().toISOString().slice(0, 10));

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
    if (receipt.totalCents) setAmount((receipt.totalCents.value / 100).toFixed(2));
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
        occurredAt: new Date(when).toISOString(),
      });
      await uploadToPresignedUrl(presigned.uploadUrl, file.uri, 'application/pdf');
      setUploadedKey(presigned.fileKey);

      const answer = await assetsApi.readReceipt(assetId, {
        fileKey: presigned.fileKey,
        occurredAt: new Date(when).toISOString(),
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
  }, [busy, assetId, when, applyRead, t, toast]);

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
    setSending(true);
    let receiptKey: string | undefined;
    try {
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
            occurredAt: new Date(when).toISOString(),
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
        occurredAt: new Date(when).toISOString(),
        receiptKey,
        receiptName: receiptKey ? 'receipt.jpg' : undefined,
        receiptMime: receiptKey ? shot?.mime : undefined,
      });

      toast.success(t('expenses.sent', 'Sent — the office will confirm it.'));
      discardShot();
      router.back();
    } catch (e: any) {
      toast.error(e?.message || t('expenses.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
  }, [cents, category, shot, assetId, when, note, discardShot, t, toast]);

  // ── Is this mine at all? ──────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('expenses.title', 'Add a receipt')} />
        <View style={s.centre}><ActivityIndicator color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }
  if (!held) {
    /*
      A route is reachable by deep link whether or not a button points at it.
      The server refuses regardless — custody is checked there — but letting
      somebody photograph a slip and only then be refused wastes their time.
    */
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('expenses.title', 'Add a receipt')} />
        <View style={s.centre}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t('expenses.notYours', 'You do not have this one.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera permission ─────────────────────────────────────────────────────
  if (stage === 'camera' && !cam.granted) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('expenses.title', 'Add a receipt')} />
        <MediaAccessScreen
          purpose="receipt"
          access={cam}
          onCancel={() => setStage('review')}
        />
      </SafeAreaView>
    );
  }

  // ── Check before sending ──────────────────────────────────────────────────
  if (stage === 'review') {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header
          colors={colors}
          title={t('expenses.review', 'Check before sending')}
          onBack={() => { discardShot(); setStage('camera'); }}
        />
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
            <TextInput
              value={when}
              onChangeText={setWhen}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={[s.input, { color: colors.textPrimary }]}
            />
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

          <View style={[s.receiptRow, { borderColor: colors.border }]}>
            <Ionicons name={shot ? 'image' : 'image-outline'} size={18} color={shot ? '#22c55e' : colors.textMuted} />
            <Text style={{ flex: 1, fontSize: FONT_SIZE.sm, color: colors.textMuted }}>
              {shot ? t('expenses.photoAttached', 'Photo attached') : t('expenses.noPhoto', 'No photo')}
            </Text>
            <TouchableOpacity onPress={() => { discardShot(); setStage('camera'); }}>
              <Text style={{ color: COLORS.primary, fontSize: FONT_SIZE.xs, fontWeight: '700' }}>
                {shot ? t('expenses.retake', 'Retake') : t('expenses.takePhoto', 'Take one')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={send}
            disabled={sending || !cents || !category}
            style={[s.primary, { backgroundColor: cents && category ? COLORS.primary : colors.border }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" />
                     : <Text style={s.primaryText}>{t('expenses.send', 'Send it in')}</Text>}
          </TouchableOpacity>
          <Text style={[s.footnote, { color: colors.textMuted }]}>
            {t('expenses.pendingHint', 'It counts once the office accepts it.')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  return (
    <View style={s.black}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={s.camHead}>
          <TouchableOpacity onPress={() => router.back()} style={s.camBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={s.camTitle} numberOfLines={1}>{held.asset?.name ?? ''}</Text>
          <View style={s.camBtn} />
        </View>

        {/* No frame, deliberately: a receipt is a strip of any proportion, and a
            rectangle nobody can fill teaches people the scan is broken. */}
        <View style={s.camMid} pointerEvents="none">
          <Text style={s.camHint}>{t('expenses.aim', 'Get the whole slip in shot')}</Text>
        </View>

        <View style={s.camFoot}>
          {/*
            Two ways in, and the camera is still the primary one — it is what a
            driver at a pump has. "Choose a file" is for the invoice that
            arrived by email, which is the only way a PDF ever gets here.
          */}
          <TouchableOpacity onPress={pickFile} disabled={busy} style={s.skip}>
            <Text style={s.skipText}>{t('expenses.chooseFile', 'Choose a file')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStage('review')} style={s.skip}>
            <Text style={s.skipText}>{t('expenses.typeInstead', 'Type it instead')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={capture} disabled={busy} style={s.shutter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
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

function Header({ colors, title, onBack }: { colors: any; title: string; onBack?: () => void }) {
  return (
    <View style={[s.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={onBack ?? (() => router.back())} style={s.hBtn}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={[s.hTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={s.hBtn} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  black: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold as any },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  asset: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },

  camHead: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  camBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  camTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: FONT_SIZE.base, fontWeight: '600' },
  camMid: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: SPACING.xl },
  camHint: { color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  /* ⚠️ `marginTop: 'auto'` is what keeps the shutter at the bottom — the same
     trap the card scanner documents: without it the foot rides up under the
     close button on a real phone. */
  camFoot: { marginTop: 'auto', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.xl },
  skip: { paddingVertical: 6, paddingHorizontal: SPACING.lg, borderRadius: 99, backgroundColor: 'rgba(0,0,0,.45)' },
  skipText: { color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },

  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' },
  badgeOk: { color: '#4ade80', backgroundColor: 'rgba(22,163,74,.16)' },
  badgeCheck: { color: '#fbbf24', backgroundColor: 'rgba(245,158,11,.16)' },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  amountInput: { fontSize: 26, fontWeight: '700' },
  boxed: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10 },

  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: SPACING.md, paddingVertical: 8 },

  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  footnote: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
});
