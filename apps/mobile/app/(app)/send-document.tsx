import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';

import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { canScanContracts, scanContract } from '../../src/lib/receipt-scan';
import { assetProposalsApi, uploadToPresignedUrl, type ContractFields } from '../../src/lib/api';
import { classifyDocument, type DocumentClassification } from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

/**
 * Send a page in and let somebody responsible decide.
 *
 * A driver is handed a rental agreement at a desk. They cannot create assets —
 * creating a record, reassigning the organization's property and taking a
 * vehicle off the books is not theirs to do, and never will be. What they can
 * do is photograph the page, and the alternative to this screen is the paper
 * living in the door pocket until somebody types it in March.
 *
 * ⚠️ THE TEXT NEVER LEAVES THIS PHONE. The reading happens on the device; a
 * rental agreement carries the member's home address, their licence number and
 * their bank details, and the organization gets the six fields that describe
 * the vehicle. The PAGE itself is uploaded — a reviewer has to be able to check
 * the reading against it — and that is a deliberate, visible trade the screen
 * states rather than a side effect.
 *
 * ⚠️ AND THE READER CAN SAY NO. A page it does not recognise is offered as
 * "send it anyway", never dressed up as a contract: putting a proposal for a
 * vehicle that does not exist in somebody's queue is how the queue stops being
 * read, which costs the real ones too.
 */

type Stage = 'camera' | 'review';

export default function SendDocumentScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const cam = useCameraAccess();
  const camera = useRef<CameraView>(null);

  const [stage, setStage] = useState<Stage>('camera');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const [shot, setShot] = useState<{ uri: string; mime: string } | null>(null);
  const [verdict, setVerdict] = useState<DocumentClassification | null>(null);
  const [fields, setFields] = useState<ContractFields>({});

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      // ⚠️ Never `skipProcessing` — the reader's line ORDER comes from the y
      // coordinate, and a sideways page swaps every label with its value.
      const picture = await camera.current.takePictureAsync({ quality: 0.7 });
      if (!picture?.uri) return;
      setShot({ uri: picture.uri, mime: 'image/jpeg' });

      if (canScanContracts()) {
        const { lines } = await scanContract(picture.uri);
        const c = classifyDocument(lines);
        setVerdict(c);
        setFields({
          registration: c.contract.registration?.value ?? '',
          vin: c.contract.vin?.value ?? '',
          manufacturer: c.contract.manufacturer?.value ?? '',
          model: c.contract.model?.value ?? '',
          startsOn: c.contract.startsOn?.value ?? '',
          endsOn: c.contract.endsOn?.value ?? '',
        });
      }
      setStage('review');
    } catch {
      toast.error(t('sendDoc.readFailed', 'Could not read it — you can still send the page.'));
      setStage('review');
    } finally {
      setBusy(false);
    }
  }, [busy, t, toast]);

  const discardShot = useCallback(() => {
    if (!shot) return;
    try { new FsFile(shot.uri).delete(); } catch { /* already gone */ }
    setShot(null);
  }, [shot]);

  const named = !!(fields.registration?.trim() || fields.vin?.trim() ||
    (fields.manufacturer?.trim() && fields.model?.trim()));

  const send = useCallback(async () => {
    if (!named) return;
    setSending(true);
    let fileKey: string | undefined;
    try {
      /*
        The page goes phone → S3 directly, under a prefix that names the
        organization; the submit refuses a key outside it.

        An upload that fails does NOT stop the proposal. The six fields are what
        a reviewer needs to decide; the page is evidence, and losing it to a
        motorway signal must not cost the member the whole errand.
      */
      if (shot) {
        try {
          const presign = await assetProposalsApi.presign({
            fileName: `document-${Date.now()}.jpg`,
            mimeType: shot.mime,
          });
          await uploadToPresignedUrl(presign.uploadUrl, shot.uri, shot.mime);
          fileKey = presign.fileKey;
        } catch {
          toast.info(t('sendDoc.photoFailed', 'The page did not upload — sending what was read anyway.'));
        }
      }

      const clean: ContractFields = {};
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === 'string' && v.trim()) (clean as Record<string, string>)[k] = v.trim();
      }

      await assetProposalsApi.raise({
        fields: clean,
        signals: verdict?.signals,
        documentKind: verdict?.kind ?? 'unknown',
        fileKey,
        fileName: fileKey ? 'document.jpg' : undefined,
        fileMime: fileKey ? shot?.mime : undefined,
      });

      toast.success(t('sendDoc.sent', 'Sent — somebody will confirm it.'));
      discardShot();
      router.back();
    } catch (e: any) {
      toast.error(e?.message || t('sendDoc.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
  }, [named, shot, fields, verdict, discardShot, t, toast]);

  // ── Camera permission ─────────────────────────────────────────────────────
  if (stage === 'camera' && !cam.granted) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('sendDoc.title', 'Send a document')} />
        <MediaAccessScreen
          purpose="document"
          access={cam}
          onCancel={() => setStage('review')}
        />
      </SafeAreaView>
    );
  }

  // ── What it made of it ────────────────────────────────────────────────────
  if (stage === 'review') {
    const recognised = verdict?.kind === 'asset-contract';
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header
          colors={colors}
          title={t('sendDoc.check', 'Check before sending')}
          onBack={() => { discardShot(); setStage('camera'); }}
        />
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}>
          {/*
            What the reader thought, and WHY — in words the member can check
            against the paper in their hand. A verdict nobody can argue with is
            one people either trust blindly or ignore entirely.
          */}
          <View style={[
            s.verdict,
            { borderColor: recognised ? 'rgba(22,163,74,.45)' : colors.border },
          ]}>
            <Ionicons
              name={recognised ? 'sparkles' : 'help-circle-outline'}
              size={18}
              color={recognised ? '#22c55e' : colors.textMuted}
            />
            <View style={s.grow}>
              <Text style={[s.verdictTitle, { color: colors.textPrimary }]}>
                {recognised
                  ? t('sendDoc.looksLike', 'This looks like a contract for a new asset')
                  : t('sendDoc.notSure', 'Not sure what this is')}
              </Text>
              <Text style={[s.verdictSub, { color: colors.textMuted }]}>
                {verdict?.signals?.length
                  ? verdict.signals.join(' · ')
                  : t('sendDoc.notSureSub', 'You can still send it — somebody will look.')}
              </Text>
            </View>
          </View>

          <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.lg }]}>
            {t('sendDoc.what', 'What it is')}
          </Text>
          <Field colors={colors} label={t('contract.fRegistration', 'Registration')}
            value={fields.registration ?? ''} onChange={(v) => setFields((f) => ({ ...f, registration: v }))} />
          <Field colors={colors} label={t('contract.fVin', 'VIN / serial')}
            value={fields.vin ?? ''} onChange={(v) => setFields((f) => ({ ...f, vin: v }))} />
          <Field colors={colors} label={t('contract.fManufacturer', 'Make')}
            value={fields.manufacturer ?? ''} onChange={(v) => setFields((f) => ({ ...f, manufacturer: v }))} />
          <Field colors={colors} label={t('contract.fModel', 'Model')}
            value={fields.model ?? ''} onChange={(v) => setFields((f) => ({ ...f, model: v }))} />

          {!named && (
            <Text style={s.warn}>
              {t('contract.needName', 'Nothing here identifies it yet — a registration, a VIN, or a make and model.')}
            </Text>
          )}

          <View style={[s.docRow, { borderColor: colors.border }]}>
            <Ionicons name={shot ? 'document' : 'document-outline'} size={18} color={shot ? '#22c55e' : colors.textMuted} />
            <Text style={{ flex: 1, fontSize: FONT_SIZE.sm, color: colors.textMuted }}>
              {shot ? t('sendDoc.pageAttached', 'The page will be sent too') : t('sendDoc.noPage', 'No page')}
            </Text>
            <TouchableOpacity onPress={() => { discardShot(); setStage('camera'); }}>
              <Text style={{ color: COLORS.primary, fontSize: FONT_SIZE.xs, fontWeight: '700' }}>
                {shot ? t('expenses.retake', 'Retake') : t('expenses.takePhoto', 'Take one')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={send}
            disabled={!named || sending}
            style={[s.primary, { backgroundColor: named ? COLORS.primary : colors.border }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.primaryText}>
                  {recognised ? t('sendDoc.send', 'Send it in') : t('sendDoc.sendAnyway', 'Send it anyway')}
                </Text>}
          </TouchableOpacity>
          <Text style={[s.footnote, { color: colors.textMuted }]}>
            {t('sendDoc.hint', 'Nothing is created. Somebody responsible for you decides.')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── The page ──────────────────────────────────────────────────────────────
  return (
    <View style={s.black}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={s.camHead}>
          <TouchableOpacity onPress={() => router.back()} style={s.camBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.camMid} pointerEvents="none">
          <Text style={s.camHint}>{t('sendDoc.aim', 'Get the page in shot — it is read on this phone')}</Text>
        </View>
        <View style={s.camFoot}>
          <TouchableOpacity onPress={() => setStage('review')} style={s.skip}>
            <Text style={s.skipText}>{t('contract.typeInstead', 'Type it instead')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={capture} disabled={busy} style={s.shutter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Field({
  colors, label, value, onChange,
}: { colors: any; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={[s.field, { borderColor: colors.border }]}>
      <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        style={[s.input, { color: colors.textPrimary }]}
      />
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
  grow: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold as any },

  camHead: { flexDirection: 'row', padding: SPACING.md },
  camBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  camMid: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: SPACING.xl, paddingHorizontal: SPACING.xl },
  camHint: { color: '#e6ecf5', fontSize: FONT_SIZE.sm, textAlign: 'center' },
  // ⚠️ `marginTop: 'auto'` is what keeps the shutter at the bottom.
  camFoot: { marginTop: 'auto', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.xl },
  skip: { paddingVertical: 6, paddingHorizontal: SPACING.lg, borderRadius: 99, backgroundColor: 'rgba(0,0,0,.45)' },
  skipText: { color: '#e6ecf5', fontSize: FONT_SIZE.sm },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },

  verdict: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  verdictTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any },
  verdictSub: { fontSize: FONT_SIZE.xs, marginTop: 3, lineHeight: 17 },

  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  warn: { color: '#f59e0b', fontSize: FONT_SIZE.xs, marginTop: SPACING.sm },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  footnote: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
});
