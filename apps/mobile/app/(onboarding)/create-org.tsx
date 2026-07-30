/**
 * Guided create-org wizard (mobile port of the web setup wizard).
 *
 * Tap-first, 3 quick questions → a real org + spaces via the shared setup engine:
 *   1. What you do   → industry tap-cards + optional free text (classifyWork / planFromIndustry)
 *   2. Group work    → confirm/rename/remove the derived work areas (become Spaces)
 *   3. Name + confirm→ org name + a summary, then Create
 *
 * The setup catalog/classifier is the shared SSOT (`@hbcfield/shared/client`).
 * NOTE: the mobile onboarding API can't set `enabledModules` (no such param on
 * createOrganization / locationsApi.create), so we DON'T send modules here — the
 * org uses its defaults and the enabled modules can be adjusted later on web.
 */
import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  INDUSTRY_CARDS,
  AREAS,
  classifyWork,
  planFromIndustry,
  toolsFromModules,
  type WorkPlan,
} from '@hbcfield/shared/client';
import { ScreenContainer } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { onboardingApi, locationsApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../src/lib/constants';

/** Catalog icon keys → Ionicons names (single binding point, like wizard-icons on web). */
const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  package: 'cube-outline',
  refresh: 'refresh-outline',
  wrench: 'construct-outline',
  alert: 'warning-outline',
  search: 'search-outline',
  inbox: 'file-tray-outline',
  spray: 'water-outline',
  sparkles: 'sparkles-outline',
  wand: 'color-wand-outline',
  shield: 'shield-checkmark-outline',
  door: 'exit-outline',
  ruler: 'resize-outline',
  ticket: 'pricetag-outline',
  mapPin: 'location-outline',
  truck: 'car-outline',
  trees: 'leaf-outline',
  clipboard: 'clipboard-outline',
  grid: 'grid-outline',
  factory: 'business-outline',
  building: 'business-outline',
  hardHat: 'hammer-outline',
  server: 'server-outline',
  sun: 'sunny-outline',
  bug: 'bug-outline',
  folder: 'folder-outline',
  check: 'checkmark-outline',
  settings: 'settings-outline',
  users: 'people-outline',
  user: 'person-outline',
  mail: 'mail-outline',
  checkCircle: 'checkmark-circle-outline',
};

function ionicon(key: string): keyof typeof Ionicons.glyphMap {
  return ICON_MAP[key] ?? 'ellipse-outline';
}

type Step = 0 | 1 | 2;
const TOTAL_STEPS = 3;

export default function CreateOrgScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>(0);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  const [fromText, setFromText] = useState(false);
  // Areas as localized display names the user can rename/remove.
  const [areaNames, setAreaNames] = useState<string[]>([]);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // i18n resolvers (labels come from the `setup` namespace).
  const areaLabel = (key: string) => t(`setup.areaNames.${key}`);
  const toolLabel = (key: string) => t(`setup.tools.${key}`);
  const industryLabel = (key: string, fallback: string) =>
    t(`setup.industries.${key}`, { defaultValue: fallback });

  const tools = useMemo(() => (plan ? toolsFromModules(plan.moduleKeys) : []), [plan]);
  const firstName = user?.firstName || t('setup.friend');

  // ---- Q1 ----
  const onType = (v: string) => {
    setText(v);
    setFromText(true);
    setPlan(v.trim().length >= 3 ? classifyWork(v) : null);
  };
  const tapIndustry = (key: string) => {
    const ind = INDUSTRY_CARDS.find((i) => i.key === key);
    if (!ind) return;
    const p = planFromIndustry(ind);
    setPlan(p);
    setFromText(false);
    setText('');
    goToAreas(p);
  };
  const confirmText = () => {
    if (!plan) return;
    goToAreas(plan);
  };

  const goToAreas = (p: WorkPlan) => {
    setAreaNames(p.areas.map(areaLabel));
    setStep(1);
  };

  // ---- Q2: edit areas ----
  const renameArea = (i: number, v: string) =>
    setAreaNames((prev) => prev.map((n, idx) => (idx === i ? v : n)));
  const removeArea = (i: number) =>
    setAreaNames((prev) => prev.filter((_, idx) => idx !== i));
  const confirmAreas = () => {
    if (areaNames.filter((n) => n.trim()).length === 0) {
      toast.error(t('common.error'), t('setup.mobile.needOneArea'));
      return;
    }
    setStep(2);
  };

  // ---- Q3: create ----
  const handleCreate = async () => {
    const name = orgName.trim();
    if (name.length < 2) {
      toast.error(t('common.error'), t('validation.organizationNameMinLength'));
      return;
    }
    if (!plan) return;
    const names = areaNames.map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) {
      toast.error(t('common.error'), t('setup.mobile.needOneArea'));
      return;
    }

    setIsLoading(true);
    try {
      // 1. Create the org + its first space (becomes the default bucket).
      //    NOTE: mobile API can't set enabledModules — org uses defaults, tunable on web.
      await onboardingApi.createOrganization({
        name,
        industry: plan.industryLabel,
        firstSpaceName: names[0],
      });

      // 2. Create the remaining areas as spaces (concurrently, best-effort).
      if (names.length > 1) {
        await Promise.allSettled(
          names.slice(1).map((n) => locationsApi.create({ name: n })),
        );
      }

      // 3. Refresh — the nav guard redirects into the app.
      await refreshUser();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('onboarding.createOrg.failedToCreate');
      toast.error(t('common.error'), message);
      setIsLoading(false);
    }
  };

  const onBack = () => {
    if (step === 0) { router.back(); return; }
    setStep((s) => (s - 1) as Step);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenContainer width="content">
          {/* Header: back + progress */}
          <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
            <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={isLoading}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.progress, { color: colors.textMuted }]}>
              {t('setup.stepOf', { step: step + 1, total: TOTAL_STEPS })}
            </Text>
            <View style={styles.backButton} />
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { backgroundColor: COLORS.primary, width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* ---- Step 0: what you do ---- */}
            {step === 0 && (
              <View>
                <Kicker colors={colors} icon="sparkles" text={t('setup.work.kicker')} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('setup.work.title')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('setup.work.sub')}</Text>

                <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                  <View style={[styles.inputIcon, { backgroundColor: colors.surfaceRaised, borderRightColor: colors.inputBorder }]}>
                    <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                  </View>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder={t('setup.work.placeholder')}
                    placeholderTextColor={colors.textMuted}
                    value={text}
                    onChangeText={onType}
                    multiline
                  />
                </View>

                {plan && fromText && text.trim().length >= 3 && (
                  <View style={[styles.understood, { backgroundColor: colors.card, borderColor: COLORS.successBorder }]}>
                    <View style={styles.understoodEyebrowRow}>
                      <Ionicons name="sparkles" size={13} color={COLORS.primaryDark} />
                      <Text style={[styles.eyebrow, { color: COLORS.primaryDark }]}>{t('setup.work.understoodEyebrow')}</Text>
                    </View>
                    <View style={styles.understoodTitleRow}>
                      <View style={[styles.understoodIcon, { backgroundColor: COLORS.primaryLight }]}>
                        <Ionicons name={ionicon(plan.industryIcon)} size={19} color={COLORS.primaryDark} />
                      </View>
                      <Text style={[styles.understoodTitle, { color: colors.textPrimary }]}>
                        {t('setup.work.youreIn', { industry: industryLabel(plan.industryKey, plan.industryLabel) })}
                      </Text>
                    </View>

                    <Text style={[styles.chipLabel, { color: colors.textMuted }]}>{t('setup.work.areasLabel')}</Text>
                    <View style={styles.chipWrap}>
                      {plan.areas.map((a) => (
                        <Chip key={a} colors={colors} icon={AREAS[a]?.icon ?? 'clipboard'} label={areaLabel(a)} />
                      ))}
                    </View>

                    <Text style={[styles.chipLabel, { color: colors.textMuted }]}>{t('setup.work.toolsLabel')}</Text>
                    <View style={styles.chipWrap}>
                      {tools.map((tl) => (
                        <Chip key={tl.key} colors={colors} icon={tl.icon} label={toolLabel(tl.key)} muted />
                      ))}
                    </View>

                    <TouchableOpacity style={styles.primaryBtn} onPress={confirmText} activeOpacity={0.9}>
                      <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
                        <Text style={styles.primaryBtnText}>{t('setup.work.continue')}</Text>
                        <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textMuted }]}>{t('setup.work.orPick')}</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <View style={styles.grid}>
                  {INDUSTRY_CARDS.map((ind) => {
                    const on = !fromText && plan?.industryKey === ind.key;
                    return (
                      <TouchableOpacity
                        key={ind.key}
                        style={[styles.card, { borderColor: on ? COLORS.primary : colors.inputBorder, backgroundColor: on ? COLORS.primaryLight : colors.card }]}
                        onPress={() => tapIndustry(ind.key)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.cardIcon, { backgroundColor: on ? COLORS.primary : colors.surfaceRaised }]}>
                          <Ionicons name={ionicon(ind.icon)} size={20} color={on ? COLORS.white : colors.textSecondary} />
                        </View>
                        <Text style={[styles.cardLabel, { color: on ? COLORS.primaryDark : colors.textPrimary }]} numberOfLines={2}>
                          {industryLabel(ind.key, ind.label)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ---- Step 1: group / areas ---- */}
            {step === 1 && plan && (
              <View>
                <Kicker colors={colors} icon="folder" text={t('setup.group.kicker')} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('setup.group.confirmTitle')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('setup.group.confirmSub')}</Text>

                <View style={styles.areaList}>
                  {areaNames.map((n, i) => (
                    <View key={i} style={[styles.areaRow, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                      <View style={[styles.areaIcon, { backgroundColor: colors.surfaceRaised }]}>
                        <Ionicons name="folder-outline" size={16} color={colors.textSecondary} />
                      </View>
                      <TextInput
                        style={[styles.areaInput, { color: colors.textPrimary }]}
                        value={n}
                        onChangeText={(v) => renameArea(i, v)}
                        placeholder={t('setup.mobile.areaNamePlaceholder')}
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity onPress={() => removeArea(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={confirmAreas} activeOpacity={0.9}>
                  <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
                    <Text style={styles.primaryBtnText}>{t('setup.group.looksGood')}</Text>
                    <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ---- Step 2: name + confirm ---- */}
            {step === 2 && plan && (
              <View>
                <Kicker colors={colors} icon="checkCircle" text={t('setup.mobile.almostThere')} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('setup.mobile.nameTitle', { name: firstName })}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('setup.mobile.nameSub')}</Text>

                <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.createOrg.nameLabel')}</Text>
                <View style={[styles.inputContainer, styles.singleLine, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                  <View style={[styles.inputIcon, { backgroundColor: colors.surfaceRaised, borderRightColor: colors.inputBorder }]}>
                    <Ionicons name="business-outline" size={18} color={colors.textMuted} />
                  </View>
                  <TextInput
                    style={[styles.input, styles.inputSingle, { color: colors.textPrimary }]}
                    placeholder={t('onboarding.createOrg.namePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    value={orgName}
                    onChangeText={setOrgName}
                    autoCapitalize="words"
                  />
                </View>

                {/* Summary */}
                <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                  <SummaryRow colors={colors} icon={ionicon(plan.industryIcon)} title={t('setup.mobile.summaryIndustry')} detail={industryLabel(plan.industryKey, plan.industryLabel)} />
                  <SummaryRow colors={colors} icon="folder-outline" title={t('setup.done.areasTitle')} detail={areaNames.filter((n) => n.trim()).join(' · ')} />
                  <SummaryRow colors={colors} icon="construct-outline" title={t('setup.done.toolsTitle')} detail={tools.map((tl) => toolLabel(tl.key)).join(' · ')} last />
                </View>

                <TouchableOpacity style={[styles.primaryBtn, isLoading && styles.btnDisabled]} onPress={handleCreate} disabled={isLoading} activeOpacity={0.9}>
                  <LinearGradient colors={isLoading ? [COLORS.slate400, COLORS.slate500] : [COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
                    {isLoading ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <Text style={styles.primaryBtnText}>{t('setup.mobile.createButton')}</Text>
                        <Ionicons name="checkmark" size={18} color={COLORS.white} />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </ScreenContainer>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ---------------- presentational helpers ---------------- */

function Kicker({ colors, icon, text }: { colors: { primaryLight?: string }; icon: string; text: string }) {
  return (
    <View style={[styles.kicker, { backgroundColor: COLORS.primaryLight, borderColor: COLORS.successBorder }]}>
      <Ionicons name={ionicon(icon)} size={13} color={COLORS.primaryDark} />
      <Text style={[styles.kickerText, { color: COLORS.primaryDark }]}>{text}</Text>
    </View>
  );
}

function Chip({ colors, icon, label, muted }: { colors: { textSecondary: string; surfaceRaised: string; inputBorder: string }; icon: string; label: string; muted?: boolean }) {
  return (
    <View style={[
      styles.chip,
      muted
        ? { backgroundColor: colors.surfaceRaised, borderColor: colors.inputBorder }
        : { backgroundColor: COLORS.primaryLight, borderColor: COLORS.successBorder },
    ]}>
      <Ionicons name={ionicon(icon)} size={13} color={muted ? colors.textSecondary : COLORS.primaryDark} />
      <Text style={[styles.chipText, { color: muted ? colors.textSecondary : COLORS.primaryDark }]}>{label}</Text>
    </View>
  );
}

function SummaryRow({ colors, icon, title, detail, last }: { colors: { textPrimary: string; textMuted: string; surfaceRaised: string; border: string }; icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name={icon} size={17} color={COLORS.primaryDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>{title}</Text>
        {!!detail && <Text style={[styles.summaryDetail, { color: colors.textMuted }]}>{detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  progress: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  progressBarTrack: { height: 3, backgroundColor: 'transparent', marginTop: SPACING.sm, marginHorizontal: SPACING.lg, borderRadius: RADIUS.full, overflow: 'hidden' },
  progressBarFill: { height: 3, borderRadius: RADIUS.full },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.xxxl },

  kicker: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 6, marginBottom: SPACING.md },
  kickerText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  title: { fontSize: FONT_SIZE.title, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.xs, letterSpacing: -0.3 },
  subtitle: { fontSize: FONT_SIZE.lg, lineHeight: 22, marginBottom: SPACING.xl },
  label: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm },

  inputContainer: { flexDirection: 'row', borderRadius: RADIUS.md, borderWidth: 1.5, overflow: 'hidden', minHeight: 54, alignItems: 'stretch' },
  singleLine: { minHeight: 52 },
  inputIcon: { width: 44, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1 },
  input: { flex: 1, fontSize: FONT_SIZE.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, textAlignVertical: 'top' },
  inputSingle: { textAlignVertical: 'center', paddingVertical: 0 },

  understood: { marginTop: SPACING.lg, borderWidth: 1, borderLeftWidth: 4, borderRadius: RADIUS.md, padding: SPACING.lg, ...SHADOWS.md },
  understoodEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  eyebrow: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  understoodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  understoodIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  understoodTitle: { flex: 1, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },

  chipLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: SPACING.md, marginBottom: SPACING.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  chipText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginVertical: SPACING.xl },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: 0.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  card: { width: '31%', borderWidth: 1.5, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', gap: SPACING.sm, minHeight: 96, justifyContent: 'center' },
  cardIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  cardLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center' },

  areaList: { gap: SPACING.sm, marginBottom: SPACING.lg },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 52 },
  areaIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  areaInput: { flex: 1, fontSize: FONT_SIZE.lg },

  summary: { marginTop: SPACING.xl, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  summaryIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  summaryTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  summaryDetail: { fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 18 },

  primaryBtn: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', ...SHADOWS.lg, shadowColor: COLORS.primary },
  btnDisabled: { shadowOpacity: 0.1 },
  primaryBtnGrad: { height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  primaryBtnText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
