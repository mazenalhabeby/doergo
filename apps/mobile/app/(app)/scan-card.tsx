import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { scanBusinessCard, type ParsedCard } from '../../src/lib/card-scan';
import { customersApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

/**
 * Scan a business card into a client.
 *
 * Two states in one screen: the camera, then what was read. They are not
 * separate routes because the second is a review of the first — going "back"
 * from the review must return to the camera, not to the client list.
 *
 * ⚠️ Nothing saves without the person seeing it. Fields the reader can PROVE
 * (email, phone, website) are marked certain; fields it INFERS (name, company,
 * title) are marked as needing a look, and every line the card gave stays
 * available so a wrong guess is one tap to fix rather than a re-scan.
 */

type FieldKey = 'name' | 'company' | 'title' | 'email' | 'phone';

export default function ScanCardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<ParsedCard | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    name: '', company: '', title: '', email: '', phone: '',
  });
  const [certain, setCertain] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [picking, setPicking] = useState<FieldKey | null>(null);
  const [saving, setSaving] = useState(false);

  const capture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
      if (!shot?.uri) return;
      const parsed = await scanBusinessCard(shot.uri, shot.height ?? 0);
      setCard(parsed);
      setValues({
        name: parsed.name?.value ?? '',
        company: parsed.company?.value ?? '',
        title: parsed.title?.value ?? '',
        email: parsed.email?.value ?? '',
        phone: parsed.phone?.value ?? '',
      });
      setCertain({
        name: parsed.name?.confidence === 'certain',
        company: parsed.company?.confidence === 'certain',
        title: parsed.title?.confidence === 'certain',
        email: parsed.email?.confidence === 'certain',
        phone: parsed.phone?.confidence === 'certain',
      });
      if (parsed.lines.length === 0) {
        toast.error(t('scan.nothingRead', 'Nothing could be read — try again with more light.'));
        setCard(null);
      }
    } catch {
      toast.error(t('scan.failed', 'Could not read the card.'));
    } finally {
      setBusy(false);
    }
  }, [busy, t, toast]);

  const save = useCallback(async () => {
    const name = (values.company || values.name).trim();
    if (!name) return;
    setSaving(true);
    try {
      await customersApi.create({
        name,
        // The company is the client; the person on the card is the contact.
        contactName: values.company ? values.name.trim() || undefined : undefined,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
      });
      toast.success(t('customers.added', 'Client added'));
      router.back();
    } catch (e: any) {
      toast.error(e?.message || t('customers.addFailed', 'Could not add the client'));
    } finally {
      setSaving(false);
    }
  }, [values, t, toast]);

  // ── Permission ────────────────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <Header colors={colors} title={t('scan.title', 'Scan a card')} />
        <View style={s.centre}>
          <Ionicons name="camera-outline" size={44} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t('scan.needCamera', 'The camera is needed to read a business card.')}
          </Text>
          <TouchableOpacity style={[s.primary, { backgroundColor: COLORS.primary }]} onPress={requestPermission}>
            <Text style={s.primaryText}>{t('scan.allow', 'Allow camera')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Review what was read ──────────────────────────────────────────────────
  if (card) {
    const field = (key: FieldKey, label: string) => (
      <View key={key} style={[s.field, { borderColor: certain[key] ? 'rgba(22,163,74,.45)' : 'rgba(245,158,11,.5)' }]}>
        <View style={s.fieldHead}>
          <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
          <Text style={[s.badge, certain[key] ? s.badgeOk : s.badgeCheck]}>
            {certain[key] ? t('scan.found', 'FOUND') : t('scan.check', 'CHECK')}
          </Text>
        </View>
        <TextInput
          value={values[key]}
          onChangeText={(v) => setValues((p) => ({ ...p, [key]: v }))}
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          autoCapitalize={key === 'email' ? 'none' : 'words'}
          style={[s.fieldInput, { color: colors.textPrimary }]}
        />
        <TouchableOpacity onPress={() => setPicking(picking === key ? null : key)}>
          <Text style={[s.pick, { color: COLORS.primary }]}>
            {picking === key ? t('scan.hideLines', 'Hide lines') : t('scan.otherLine', 'Pick a different line')}
          </Text>
        </TouchableOpacity>
        {picking === key && (
          <View style={s.lines}>
            {card.lines.map((line, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  setValues((p) => ({ ...p, [key]: line }));
                  // Chosen by a person — no longer a guess.
                  setCertain((p) => ({ ...p, [key]: true }));
                  setPicking(null);
                }}
                style={[s.lineRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm }} numberOfLines={1}>{line}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );

    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <Header colors={colors} title={t('scan.review', 'Check before saving')} onBack={() => setCard(null)} />
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }}>
          {field('company', t('customers.fName', 'Company'))}
          {field('name', t('customers.fContact', 'Contact person'))}
          {field('title', t('scan.jobTitle', 'Job title'))}
          {field('email', t('customers.fEmail', 'Email'))}
          {field('phone', t('customers.fPhone', 'Phone'))}

          <TouchableOpacity
            onPress={save}
            disabled={saving || !(values.company || values.name).trim()}
            style={[s.primary, { backgroundColor: (values.company || values.name).trim() ? COLORS.primary : colors.border }]}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.primaryText}>{t('customers.save', 'Save client')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.ghost} onPress={() => setCard(null)}>
            <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm }}>{t('scan.again', 'Scan again')}</Text>
          </TouchableOpacity>
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
        </View>

        {/* A card-shaped frame: 85×55mm is the standard, so the guide is the
            shape of the thing rather than a generic rectangle. */}
        <View style={s.guideWrap} pointerEvents="none">
          <View style={s.guide} />
          <Text style={s.guideHint}>{t('scan.frame', 'Fit the card inside the frame')}</Text>
        </View>

        <View style={s.camFoot}>
          <TouchableOpacity onPress={capture} disabled={busy} style={s.shutter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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

  camHead: { flexDirection: 'row', padding: SPACING.md },
  camBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  guideWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 85:55 — the aspect ratio of every business card in the world.
  guide: { width: '86%', aspectRatio: 85 / 55, borderWidth: 2, borderColor: '#22c55e', borderRadius: 12 },
  guideHint: { color: '#e6ecf5', fontSize: FONT_SIZE.sm, marginTop: SPACING.md },
  camFoot: { alignItems: 'center', paddingBottom: SPACING.xl },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },

  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' },
  badgeOk: { color: '#4ade80', backgroundColor: 'rgba(22,163,74,.16)' },
  badgeCheck: { color: '#fbbf24', backgroundColor: 'rgba(245,158,11,.16)' },
  fieldInput: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  pick: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold as any },
  lines: { marginTop: SPACING.sm, gap: 6 },
  lineRow: { borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 9, paddingHorizontal: SPACING.md },

  primary: { borderRadius: RADIUS.md, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  ghost: { alignItems: 'center', paddingVertical: SPACING.md },
});
