import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Switch,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';

import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { useAuth } from '../../src/contexts/auth-context';
import { holds } from '../../src/lib/permissions';
import { MediaAccessScreen } from '../../src/permissions/media-access-screen';
import { useCameraAccess } from '../../src/permissions/use-media-access';
import { canScanContracts, scanContract } from '../../src/lib/receipt-scan';
import {
  assetContractsApi, membersApi,
  type AssetKind, type ContractFields, type ContractPreview,
} from '../../src/lib/api';
import { normalizeKindShape, kindHolderLabel, type ParsedContract } from '@hbcfield/shared/client';
import { forgetHeldAssets } from '../../src/hooks/use-held-assets';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

/**
 * Photograph a contract at the rental desk; the van is on the books before you
 * are out of the car park.
 *
 * The four screens this replaces: create the vehicle, type its plate and model,
 * assign it, then find the old one and retire it. The last two get skipped, and
 * skipping them is not tidy-up debt — every fuel receipt from that day lands
 * against the car nobody is driving any more.
 *
 * ⚠️ THE TEXT NEVER LEAVES THE PHONE. A rental agreement carries the member's
 * home address, their licence number and their bank details. What is sent is
 * the six fields a person confirmed, and nothing else.
 *
 * ⚠️ AND IT PROPOSES. Three stages — photograph, correct, read the
 * consequences — and the middle one cannot be skipped, because a reader that
 * quietly creates records will eventually invent a van from a receipt.
 *
 * ⚠️ Gated on `canManageAssets`. This creates a record, reassigns the
 * organization's property and can take a vehicle off the books, so it is for
 * whoever runs the register — an owner or an office manager standing at the
 * desk, not the driver. A driver raising one is a proposals queue, and a
 * different feature.
 */

type Stage = 'camera' | 'fields' | 'confirm';

export default function AssetContractScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const cam = useCameraAccess();
  const camera = useRef<CameraView>(null);

  const canManage = holds(user, 'canManageAssets');

  const [stage, setStage] = useState<Stage>('camera');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const [read, setRead] = useState<ParsedContract | null>(null);
  const [fields, setFields] = useState<ContractFields>({});
  const [kinds, setKinds] = useState<AssetKind[]>([]);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState('');
  const [holderUserId, setHolderUserId] = useState('');
  const [retire, setRetire] = useState(true);
  const [preview, setPreview] = useState<ContractPreview | null>(null);

  /*
    Only kinds whose records are HELD BY A MEMBER. A contract hands a thing to
    somebody; a kind of apartments with no member holder has nobody to hand one
    to, and offering it is a refusal two taps later with no way to act on it.
  */
  const usable = useMemo(
    () => kinds.filter((k) => {
      const shape = normalizeKindShape(k.config);
      return shape.holder.enabled && shape.holder.members;
    }),
    [kinds],
  );
  const kind = usable.find((k) => k.id === categoryId);
  const shape = normalizeKindShape(kind?.config);

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    (async () => {
      try {
        const [ks, ms] = await Promise.all([assetContractsApi.kinds(), membersApi.list()]);
        if (!alive) return;
        setKinds(ks);
        setMembers(
          (ms ?? [])
            .filter((m: any) => m.isActive !== false && m.role !== 'CUSTOMER')
            .map((m: any) => ({ id: m.id, name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email })),
        );
      } catch {
        // The pickers stay empty and the screen says so; an error toast on a
        // camera screen somebody just opened is noise.
      }
    })();
    return () => { alive = false; };
  }, [canManage]);

  useEffect(() => {
    if (!categoryId && usable.length === 1) setCategoryId(usable[0]!.id);
  }, [usable, categoryId]);

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    let uri: string | null = null;
    try {
      // ⚠️ Never `skipProcessing` — the reader's line ORDER comes from the y
      // coordinate, and a sideways image turns "top of the page" into "left of
      // the page", which swaps the labels and their values.
      const shot = await camera.current.takePictureAsync({ quality: 0.7 });
      if (!shot?.uri) return;
      uri = shot.uri;

      if (canScanContracts()) {
        const { contract } = await scanContract(shot.uri);
        setRead(contract);
        setFields({
          registration: contract.registration?.value ?? '',
          vin: contract.vin?.value ?? '',
          manufacturer: contract.manufacturer?.value ?? '',
          model: contract.model?.value ?? '',
          startsOn: contract.startsOn?.value ?? '',
          endsOn: contract.endsOn?.value ?? '',
        });
      }
      setStage('fields');
    } catch {
      toast.error(t('contract.readFailed', 'Could not read it — fill it in yourself.'));
      setStage('fields');
    } finally {
      /*
        ⚠️ Delete the photograph, always, including on failure. It is a picture
        of a named person's address, licence number and bank details sitting in
        a cache directory with no expiry and no purpose once the fields are
        read. Reading on the device is pointless if the image stays behind.
      */
      if (uri) { try { new FsFile(uri).delete(); } catch { /* already gone */ } }
      setBusy(false);
    }
  }, [busy, t, toast]);

  const trimmed = useCallback((): ContractFields => {
    const out: ContractFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'string' && v.trim()) (out as Record<string, string>)[k] = v.trim();
    }
    return out;
  }, [fields]);

  const named = !!(fields.name?.trim() || fields.registration?.trim() || fields.vin?.trim() ||
    (fields.manufacturer?.trim() && fields.model?.trim()));
  const ready = !!categoryId && !!holderUserId && named;

  const ask = useCallback(async () => {
    if (!ready) return;
    setSending(true);
    try {
      const p = await assetContractsApi.preview({
        categoryId, holderUserId, fields: trimmed(), retireReplaced: retire,
      });
      setPreview(p);
      setStage('confirm');
    } catch (e: any) {
      toast.error(e?.message || t('contract.previewFailed', 'Could not work out what that would do'));
    } finally {
      setSending(false);
    }
  }, [ready, categoryId, holderUserId, retire, trimmed, t, toast]);

  const apply = useCallback(async () => {
    setSending(true);
    try {
      const r = await assetContractsApi.apply({
        categoryId, holderUserId, fields: trimmed(), retireReplaced: retire,
      });
      // What the member holds has changed, so the cached answer is stale.
      forgetHeldAssets();
      toast.success(t('contract.created', '{{name}} is on the books and handed over.', { name: r.name }));
      router.back();
    } catch (e: any) {
      toast.error(e?.message || t('contract.applyFailed', 'Could not do it'));
    } finally {
      setSending(false);
    }
  }, [categoryId, holderUserId, retire, trimmed, t, toast]);

  // ── Allowed to do this at all? ────────────────────────────────────────────
  if (!canManage) {
    /*
      A route is reachable by deep link whether or not a button points at it.
      The server refuses regardless — the apply asks `canManageAssets` — but
      letting somebody photograph a contract, correct six fields and only then
      be refused is a waste of their time and an odd place to learn it.
    */
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('contract.title', 'From a contract')} />
        <View style={s.centre}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t('contract.notAllowed', 'Only somebody who manages the asset register can do this.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'camera' && !cam.granted) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('contract.title', 'From a contract')} />
        <MediaAccessScreen
          purpose="contract"
          access={cam}
          onCancel={() => setStage('fields')}
        />
      </SafeAreaView>
    );
  }

  // ── 2. What it made of it ─────────────────────────────────────────────────
  if (stage === 'fields') {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('contract.check', 'Check what it read')} onBack={() => setStage('camera')} />
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}>
          <Text style={[s.label, { color: colors.textMuted }]}>{t('contract.kind', 'What kind of thing')}</Text>
          <Chips
            options={usable.map((k) => ({ id: k.id, label: k.name }))}
            value={categoryId}
            onChange={setCategoryId}
            colors={colors}
            empty={t('contract.noKinds', 'No type here is held by a member.')}
          />

          <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.lg }]}>
            {kindHolderLabel(shape, t('contract.holder', 'Who gets it'))}
          </Text>
          <Chips
            options={members.map((m) => ({ id: m.id, label: m.name }))}
            value={holderUserId}
            onChange={setHolderUserId}
            colors={colors}
            empty={t('contract.noMembers', 'No members to choose from.')}
          />

          <View style={{ marginTop: SPACING.lg }}>
            <ReadField colors={colors} t={t} label={t('contract.fRegistration', 'Registration')}
              value={fields.registration ?? ''} confidence={read?.registration?.confidence}
              onChange={(v) => setFields((f) => ({ ...f, registration: v }))} />
            <ReadField colors={colors} t={t} label={t('contract.fVin', 'VIN / serial')}
              value={fields.vin ?? ''} confidence={read?.vin?.confidence}
              onChange={(v) => setFields((f) => ({ ...f, vin: v }))} />
            <ReadField colors={colors} t={t} label={t('contract.fManufacturer', 'Make')}
              value={fields.manufacturer ?? ''} confidence={read?.manufacturer?.confidence}
              onChange={(v) => setFields((f) => ({ ...f, manufacturer: v }))} />
            <ReadField colors={colors} t={t} label={t('contract.fModel', 'Model')}
              value={fields.model ?? ''} confidence={read?.model?.confidence}
              onChange={(v) => setFields((f) => ({ ...f, model: v }))} />
            <ReadField colors={colors} t={t} label={t('contract.fStarts', 'Term starts')}
              value={fields.startsOn ?? ''} confidence={read?.startsOn?.confidence}
              onChange={(v) => setFields((f) => ({ ...f, startsOn: v }))} />
            <ReadField colors={colors} t={t} label={t('contract.fEnds', 'Term ends')}
              value={fields.endsOn ?? ''} confidence={read?.endsOn?.confidence}
              onChange={(v) => setFields((f) => ({ ...f, endsOn: v }))} />
          </View>

          {!named && (
            <Text style={[s.warn]}>
              {t('contract.needName', 'Nothing here identifies it yet — a registration, a VIN, or a make and model.')}
            </Text>
          )}

          <View style={[s.switchRow, { borderColor: colors.border }]}>
            <View style={s.grow}>
              <Text style={[s.switchTitle, { color: colors.textPrimary }]}>
                {t('contract.retire', 'Retire what it replaces')}
              </Text>
              <Text style={[s.switchSub, { color: colors.textMuted }]}>
                {t('contract.retireHint', 'Keeps its history and its jobs, and stops it being billed.')}
              </Text>
            </View>
            <Switch value={retire} onValueChange={setRetire} trackColor={{ true: COLORS.primary }} />
          </View>

          <TouchableOpacity
            onPress={ask}
            disabled={!ready || sending}
            style={[s.primary, { backgroundColor: ready ? COLORS.primary : colors.border }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.primaryText}>{t('contract.next', 'See what happens')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 3. The consequences ───────────────────────────────────────────────────
  if (stage === 'confirm' && preview) {
    const holderName = members.find((m) => m.id === holderUserId)?.name ?? '';
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Header colors={colors} title={t('custody.whatHappens', 'What happens')} onBack={() => setStage('fields')} />
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}>
          {preview.steps.map((step, i) => (
            <View key={i} style={[s.step, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons
                name={
                  step.kind === 'create' ? 'add-circle'
                  : step.kind === 'hand-over' ? 'person-add'
                  : step.kind === 'retire' ? 'archive' : 'person-remove'
                }
                size={18}
                color={
                  step.kind === 'create' ? COLORS.primary
                  : step.kind === 'hand-over' ? '#22c55e'
                  : step.kind === 'retire' ? colors.textMuted : '#f59e0b'
                }
              />
              <Text style={[s.stepText, { color: colors.textPrimary }]}>
                {step.kind === 'create' && t('contract.stepCreate', 'Creates “{{name}}” in {{kind}}.', {
                  name: step.asset.name, kind: kind?.name ?? '',
                })}
                {step.kind === 'hand-over' && t('contract.stepHand', 'Hands it to {{name}} from today.', { name: holderName })}
                {step.kind === 'close' && t('contract.stepClose', 'Closes their custody of {{name}} — later costs stop landing on it.', {
                  name: step.assetName,
                })}
                {step.kind === 'retire' && t('contract.stepRetire', 'Retires {{name}}. Its history stays; it stops being billed.', {
                  name: step.assetName,
                })}
              </Text>
            </View>
          ))}

          {preview.startClamped && (
            <Text style={[s.warn]}>
              {t('contract.clamped', 'The term starts later than today, so custody is recorded from today — nothing can be held by nobody in between. The term’s own dates are kept on the record.')}
            </Text>
          )}

          <TouchableOpacity
            onPress={apply}
            disabled={!preview.canApply || sending}
            style={[s.primary, { backgroundColor: preview.canApply ? COLORS.primary : colors.border }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.primaryText}>{t('contract.apply', 'Do it')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 1. The page ───────────────────────────────────────────────────────────
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
          <Text style={s.camHint}>{t('contract.aim', 'Get the page in shot — the reading stays on this phone')}</Text>
        </View>
        <View style={s.camFoot}>
          <TouchableOpacity onPress={() => setStage('fields')} style={s.skip}>
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

function Chips({
  options, value, onChange, colors, empty,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  colors: any;
  empty: string;
}) {
  if (options.length === 0) {
    return <Text style={[s.switchSub, { color: colors.textMuted }]}>{empty}</Text>;
  }
  return (
    <View style={s.chips}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.id}
          onPress={() => onChange(o.id)}
          style={[
            s.chip,
            { borderColor: colors.border },
            value === o.id && { backgroundColor: `${COLORS.primary}1a`, borderColor: COLORS.primary },
          ]}
        >
          <Text style={{
            fontSize: FONT_SIZE.sm,
            color: value === o.id ? COLORS.primary : colors.textPrimary,
            fontWeight: value === o.id ? '700' : '400',
          }}>
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** One box, coloured by whether the reader could PROVE what it put in it. */
function ReadField({
  colors, t, label, value, confidence, onChange,
}: {
  colors: any; t: any; label: string; value: string;
  confidence?: 'certain' | 'likely'; onChange: (v: string) => void;
}) {
  const border = !confidence ? colors.border
    : confidence === 'certain' ? 'rgba(22,163,74,.45)' : 'rgba(245,158,11,.5)';
  return (
    <View style={[s.field, { borderColor: border }]}>
      <View style={s.fieldHead}>
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        {confidence && (
          <Text style={[s.badge, confidence === 'certain' ? s.badgeOk : s.badgeCheck]}>
            {confidence === 'certain' ? t('scan.found', 'FOUND') : t('scan.check', 'CHECK')}
          </Text>
        )}
      </View>
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
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },

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

  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: SPACING.md, paddingVertical: 8 },

  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' },
  badgeOk: { color: '#4ade80', backgroundColor: 'rgba(22,163,74,.16)' },
  badgeCheck: { color: '#fbbf24', backgroundColor: 'rgba(245,158,11,.16)' },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 6 },

  warn: { color: '#f59e0b', fontSize: FONT_SIZE.xs, marginTop: SPACING.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },
  switchTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any },
  switchSub: { fontSize: FONT_SIZE.xs, marginTop: 2 },

  step: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  stepText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 20 },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
});
