import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';

import { ScreenHeader } from '../../src/components';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { useImagePicker } from '../../src/hooks/useImagePicker';
import { canScanReceipts, scanReceipt } from '../../src/lib/receipt-scan';
import { assetsApi, uploadToPresignedUrl, type HeldAsset } from '../../src/lib/api';
import {
  normalizeKindShape, findLogType, validateLogValues, moneyToCents, COST_LOG_KEY,
  type KindLogField, type LogValueProblem,
} from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { logColor, logTypeLabel } from '../../src/lib/log-display';
import { useOffline } from '../../src/offline/offline-context';
import { logFromPhone } from '../../src/offline/assets/log-actions';

/**
 * "What did you do?" — one log entry against something I hold.
 *
 * The form is DRAWN FROM THE KIND: whatever fields the log type declares, in its
 * order, and nothing else. There is no Fuel screen and no Damage screen in this
 * app, which is what lets a customer add "Tyres" to their vans on Monday and a
 * driver file one that afternoon without an app release.
 *
 * ⚠️ The answers are checked HERE with the same `validateLogValues` the server
 * runs, so a missing odometer is said beside the box rather than after a round
 * trip on one bar of signal — and the server refuses exactly the same answers
 * for exactly the same reasons if a phone ever skips this.
 *
 * ⚠️ The Cost log is not drawn here. It is the existing "Add a receipt" flow,
 * with its camera and its PDF reader, and a second way to file a cost would be
 * a second set of rules to keep in step.
 */

type Draft = Record<string, string>;

const today = () => new Date().toISOString().slice(0, 10);

export default function AssetLogScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, d: string, o?: Record<string, unknown>) => string;
  const toast = useToast();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const params = useLocalSearchParams<{ assetId?: string; logType?: string }>();
  const assetId = typeof params.assetId === 'string' ? params.assetId : '';
  const logKey = typeof params.logType === 'string' ? params.logType : '';

  const [held, setHeld] = useState<HeldAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>({});
  const [when, setWhen] = useState(today());
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [problems, setProblems] = useState<LogValueProblem[]>([]);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);

  const shape = useMemo(() => normalizeKindShape(held?.asset?.category?.config), [held]);
  const type = useMemo(() => (held ? findLogType(shape, logKey) : null), [held, shape, logKey]);
  const moneyField = type?.fields.find((f) => f.type === 'money') ?? null;
  const photoField = type?.fields.find((f) => f.type === 'photo') ?? null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { periods } = await assetsApi.mine();
        // From what I HOLD, never fetched by id: this screen must not be a way
        // to look up an asset somebody was not given.
        if (alive) setHeld(periods.find((h) => h.assetId === assetId) ?? null);
      } catch (e: any) {
        if (alive) toast.error(e?.message || tt('logbook.loadFailed', 'Could not open that'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  // A cost is the receipt flow. Replace rather than push, so "back" leaves both.
  useEffect(() => {
    if (!loading && logKey === COST_LOG_KEY) router.replace({ pathname: '/(app)/asset-expense', params: { assetId } });
  }, [loading, logKey, assetId]);

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setProblems((p) => p.filter((x) => x.key !== key));
  };

  const forgetPhoto = useCallback((uri?: string) => {
    if (!uri) return;
    try { new FsFile(uri).delete(); } catch { /* already gone */ }
  }, []);

  /** The answers as the server takes them: money in cents, a photo never inside. */
  const values = useMemo(() => {
    const out: Record<string, string | number> = {};
    for (const f of type?.fields ?? []) {
      const raw = (draft[f.key] ?? '').trim();
      if (!raw || f.type === 'photo') continue;
      if (f.type === 'money') {
        const cents = moneyToCents(raw);
        out[f.key] = cents ?? raw;
      } else out[f.key] = raw;
    }
    return out;
  }, [draft, type]);

  /**
   * Read the amount and the date off a slip, on the phone — the same reader and
   * the same rules as "Add a receipt". The picture then becomes the entry's
   * photo when the type takes one; otherwise it is deleted at once, having done
   * its only job.
   */
  const readReceipt = useCallback(async () => {
    if (!moneyField || reading) return;
    const shot = await takePhoto('receipt');
    if (!shot) return;
    setReading(true);
    try {
      const { receipt } = await scanReceipt(shot.uri);
      if (receipt.totalCents) set(moneyField.key, (receipt.totalCents.value / 100).toFixed(2));
      else toast.info(tt('expenses.noTotal', 'Could not find a total — type it in.'));
      if (receipt.date) setWhen(receipt.date.value);
    } catch {
      toast.error(tt('expenses.readFailed', 'Could not read it — check the amount yourself.'));
    } finally {
      setReading(false);
    }
    if (photoField && !photo) setPhoto({ uri: shot.uri, mime: shot.mimeType || 'image/jpeg' });
    else forgetPhoto(shot.uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyField, photoField, photo, reading, takePhoto, forgetPhoto]);

  const addPhoto = useCallback(async (from: 'camera' | 'library') => {
    const purpose = moneyField ? 'receipt' : 'issue-photo';
    const picked = from === 'camera' ? await takePhoto(purpose) : (await pickFromGallery('issue-photo'))[0] ?? null;
    if (!picked) return;
    if (photo) forgetPhoto(photo.uri);
    setPhoto({ uri: picked.uri, mime: picked.mimeType || 'image/jpeg' });
    if (photoField) setProblems((p) => p.filter((x) => x.key !== photoField.key));
  }, [moneyField, photoField, photo, takePhoto, pickFromGallery, forgetPhoto]);

  const send = useCallback(async () => {
    if (!type) return;
    const occurredAt = new Date(when);
    if (Number.isNaN(occurredAt.getTime())) {
      toast.error(tt('logbook.badDate', 'That date could not be read'));
      return;
    }
    const checked = validateLogValues(type, values, { hasPhoto: !!photo, shape });
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    setSending(true);
    try {
      if (offline.engine && offline.files) {
        // Saved on the phone with its photo; both send themselves.
        const outcome = await logFromPhone(offline.engine, offline.files, {
          assetId, logType: type.key, values, note: note.trim() || undefined,
          occurredAt: occurredAt.toISOString(), photo,
        });
        if (outcome.kind === 'refused') {
          toast.error((outcome.code && tt(`offline.errors.${outcome.code}`, '')) || outcome.message || tt('logbook.sendFailed', 'Could not send it'));
          return;
        }
        toast.success(outcome.kind === 'queued' ? tt('offline.savedForLater', 'Saved — it will send itself') : tt('logbook.sent', 'Logged'));
        if (photo) forgetPhoto(photo.uri);
        router.back();
        return;
      }
      /*
        A build without the offline layer. The photo goes phone → S3 directly
        under this asset's prefix; a failed upload does NOT cost the entry — the
        odometer and the date are what the logbook needs, the picture is evidence.
      */
      let receiptKey: string | undefined;
      if (photo) {
        try {
          const presign = await assetsApi.presignLog(assetId, {
            logType: type.key, fileName: `photo-${Date.now()}.jpg`, mimeType: photo.mime, occurredAt: occurredAt.toISOString(),
          });
          await uploadToPresignedUrl(presign.uploadUrl, photo.uri, photo.mime);
          receiptKey = presign.fileKey;
        } catch {
          toast.info(tt('logbook.photoFailed', 'The photo did not upload — sending the entry anyway.'));
        }
      }
      await assetsApi.createLog(assetId, {
        logType: type.key, values, note: note.trim() || undefined, occurredAt: occurredAt.toISOString(),
        receiptKey, receiptName: receiptKey ? 'photo.jpg' : undefined, receiptMime: receiptKey ? photo?.mime : undefined,
      });
      toast.success(tt('logbook.sent', 'Logged'));
      if (photo) forgetPhoto(photo.uri);
      router.back();
    } catch (e: any) {
      toast.error(e?.message || tt('logbook.sendFailed', 'Could not send it'));
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, values, photo, shape, when, note, assetId, offline.engine, offline.files, forgetPhoto]);

  const title = type ? logTypeLabel(type, tt) : tt('logbook.title', 'What did you do?');

  if (loading || logKey === COST_LOG_KEY) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <ScreenHeader title={title} />
        <View style={s.centre}><ActivityIndicator color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }
  if (!held || !type) {
    // Reachable by deep link whatever a button points at; the server refuses too.
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <ScreenHeader title={title} />
        <View style={s.centre}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>
            {held ? tt('logbook.unknownType', 'This kind no longer logs that.') : tt('expenses.notYours', 'You do not have this one.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const problemFor = (key: string) => problems.find((p) => p.key === key);
  const needsApproval = type.needsApproval;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={title} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}
      >
        <View style={s.assetRow}>
          <View style={[s.dot, { backgroundColor: logColor(type.color) }]} />
          <Text style={[s.asset, { color: colors.textMuted }]} numberOfLines={1}>{held.asset?.name ?? ''}</Text>
        </View>

        {moneyField && canScanReceipts() && (
          <TouchableOpacity
            onPress={readReceipt}
            disabled={reading}
            style={[s.secondary, { borderColor: colors.border }]}
          >
            {reading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="scan-outline" size={18} color={COLORS.primary} />}
            <Text style={[s.secondaryText, { color: COLORS.primary }]}>{tt('logbook.readReceipt', 'Read the amount from a receipt')}</Text>
          </TouchableOpacity>
        )}

        {type.fields.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            value={draft[f.key] ?? ''}
            onChange={(v) => set(f.key, v)}
            problem={problemFor(f.key)}
            photo={f.type === 'photo' ? photo : null}
            onPhoto={addPhoto}
            onRemovePhoto={() => { if (photo) forgetPhoto(photo.uri); setPhoto(null); }}
            colors={colors}
            t={tt}
          />
        ))}

        <Text style={[s.label, { color: colors.textMuted }]}>{tt('logbook.when', 'When')}</Text>
        <TextInput
          value={when}
          onChangeText={setWhen}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={[s.input, s.boxed, { color: colors.textPrimary, borderColor: colors.border }]}
        />

        <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.md }]}>{tt('expenses.note', 'Note')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={tt('logbook.notePh', 'Anything worth knowing')}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[s.input, s.boxed, { color: colors.textPrimary, borderColor: colors.border, minHeight: 64 }]}
        />

        <TouchableOpacity
          onPress={send}
          disabled={sending}
          style={[s.primary, { backgroundColor: COLORS.primary }]}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" />
                   : <Text style={s.primaryText}>{tt('logbook.send', 'Log it')}</Text>}
        </TouchableOpacity>
        {needsApproval && (
          <Text style={[s.footnote, { color: colors.textMuted }]}>
            {tt('logbook.approvalHint', 'It counts once the office accepts it.')}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One field, drawn for its type. The problem, if any, is said under it in plain words. */
function FieldInput({
  field, value, onChange, problem, photo, onPhoto, onRemovePhoto, colors, t,
}: {
  field: KindLogField;
  value: string;
  onChange: (v: string) => void;
  problem?: LogValueProblem;
  photo: { uri: string; mime: string } | null;
  onPhoto: (from: 'camera' | 'library') => void;
  onRemovePhoto: () => void;
  colors: any;
  t: (k: string, d: string, o?: Record<string, unknown>) => string;
}) {
  const border = problem ? COLORS.error : colors.border;
  const label = `${field.label}${field.required ? ' *' : ''}`;
  const error = problem ? (
    <Text style={s.error}>{t(`logbook.problem.${problem.code}`, PROBLEM_FALLBACK[problem.code])}</Text>
  ) : null;

  if (field.type === 'choice') {
    return (
      <View style={s.block}>
        <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
        <View style={s.chips}>
          {(field.options ?? []).map((o) => {
            const on = value === o;
            return (
              <TouchableOpacity
                key={o}
                onPress={() => onChange(on ? '' : o)}
                style={[s.chip, { borderColor: problem ? border : colors.border }, on && { backgroundColor: `${COLORS.primary}1a`, borderColor: COLORS.primary }]}
              >
                <Text style={{ fontSize: FONT_SIZE.sm, color: on ? COLORS.primary : colors.textPrimary, fontWeight: on ? '700' : '400' }}>{o}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {error}
      </View>
    );
  }

  if (field.type === 'photo') {
    return (
      <View style={s.block}>
        <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
        <View style={[s.photoRow, { borderColor: border }]}>
          <Ionicons name={photo ? 'image' : 'image-outline'} size={18} color={photo ? '#22c55e' : colors.textMuted} />
          <Text style={{ flex: 1, fontSize: FONT_SIZE.sm, color: colors.textMuted }}>
            {photo ? t('expenses.photoAttached', 'Photo attached') : t('expenses.noPhoto', 'No photo')}
          </Text>
          {photo ? (
            <TouchableOpacity onPress={onRemovePhoto}>
              <Text style={s.link}>{t('logbook.removePhoto', 'Remove')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => onPhoto('camera')}>
                <Text style={s.link}>{t('expenses.takePhoto', 'Take one')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onPhoto('library')}>
                <Text style={s.link}>{t('logbook.library', 'Library')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {error}
      </View>
    );
  }

  const numeric = field.type === 'number' || field.type === 'money';
  const suffix = field.type === 'money' ? '€' : field.unit;
  return (
    <View style={s.block}>
      <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={[s.inputRow, { borderColor: border }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          placeholder={field.type === 'date' ? 'YYYY-MM-DD' : field.type === 'money' ? '0,00' : ''}
          placeholderTextColor={colors.textMuted}
          autoCapitalize={field.type === 'date' ? 'none' : 'sentences'}
          multiline={field.type === 'text'}
          style={[s.input, { flex: 1, color: colors.textPrimary }, field.type === 'money' && s.money]}
        />
        {!!suffix && <Text style={[s.suffix, { color: colors.textMuted }]}>{suffix}</Text>}
      </View>
      {field.meter && !problem && (
        <Text style={[s.hint, { color: colors.textMuted, textAlign: 'left' }]}>{t('logbook.meterHint', 'The reading on the counter now')}</Text>
      )}
      {error}
    </View>
  );
}

const PROBLEM_FALLBACK: Record<LogValueProblem['code'], string> = {
  required: 'This is needed',
  'not-a-number': 'That is not a number',
  'out-of-range': 'That number is out of range',
  'not-a-date': 'Use a date like 2026-09-14',
  'not-an-option': 'Choose one of these',
  'too-long': 'That is too long',
};

const s = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: 4 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  asset: { fontSize: FONT_SIZE.sm, flex: 1 },

  block: { marginBottom: SPACING.md },
  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 10 },
  money: { fontSize: 22, fontWeight: '700' },
  suffix: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium as any, marginLeft: SPACING.sm },
  boxed: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md },
  error: { color: COLORS.error, fontSize: FONT_SIZE.xs, marginTop: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: SPACING.md, paddingVertical: 8 },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  link: { color: COLORS.primary, fontSize: FONT_SIZE.xs, fontWeight: '700' },

  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: RADIUS.md, height: 46, marginBottom: SPACING.lg },
  secondaryText: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  footnote: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
});
