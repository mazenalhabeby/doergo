import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../src/lib/constants';
import { portalApi } from '../../src/lib/api/portal';
import { portalColor, portalTint, portalIcon } from '../../src/lib/portal-ui';
import type { IntakeCategory } from '@hbcfield/shared/client';

type StepId = 'category' | 'issue' | 'describe' | 'access' | 'time' | 'location' | 'contact';

export default function ReportWizard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const configQ = useQuery({ queryKey: ['portal', 'config'], queryFn: portalApi.config });
  const cfg = configQ.data;
  const categories: IntakeCategory[] = cfg?.categories || [];

  const [stepIdx, setStepIdx] = useState(0);
  const [catIdx, setCatIdx] = useState<number | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState<boolean | null>(true);
  const [time, setTime] = useState<'MORNING' | 'AFTERNOON' | 'EVENING' | null>('MORNING');
  const [contact, setContact] = useState<'PUSH' | 'EMAIL' | 'PHONE' | null>('PUSH');

  const category = catIdx != null ? categories[catIdx] : null;

  // Deep-link from a Home quick-category chip: preselect the category and skip
  // straight past the "what's the problem?" step. Runs once, after config loads.
  const { category: presetKey } = useLocalSearchParams<{ category?: string }>();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !presetKey || categories.length === 0) return;
    const idx = categories.findIndex((c) => c.key === presetKey);
    if (idx >= 0) {
      applied.current = true;
      setCatIdx(idx);
      setStepIdx(1);
    }
  }, [presetKey, categories]);

  // Steps are derived from the org's feature flags + whether the chosen category
  // has sub-issues — exactly like the mockup's dynamic engine.
  const steps: StepId[] = useMemo(() => {
    const f = cfg?.features;
    const s: StepId[] = ['category'];
    if (category && category.issues && category.issues.length > 0) s.push('issue');
    s.push('describe');
    if (f?.access) s.push('access');
    if (f?.location) s.push('location');
    if (f?.preferredTime) s.push('time');
    if (f?.contact) s.push('contact');
    return s;
  }, [cfg?.features, category]);

  const submit = useMutation({
    mutationFn: () =>
      portalApi.submit({
        categoryKey: category!.key,
        issue: issue || undefined,
        description: description.trim() || undefined,
        accessPermitted: cfg?.features?.access ? access ?? undefined : undefined,
        preferredTime: cfg?.features?.preferredTime ? time ?? undefined : undefined,
        contactPreference: cfg?.features?.contact ? contact ?? undefined : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'requests'] });
      router.replace('/(customer)/(tabs)/requests');
    },
    onError: (e) => {
      Alert.alert(
        t('portal.submitFailedTitle', 'Couldn’t submit'),
        e instanceof Error ? e.message : t('portal.submitFailed', 'Please try again in a moment.'),
      );
    },
  });

  if (configQ.isLoading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const isLast = stepIdx >= steps.length - 1;
  const canNext =
    step === 'category' ? category != null : step === 'issue' ? issue != null : true;

  const goNext = () => {
    if (isLast) {
      if (category) submit.mutate();
      return;
    }
    setStepIdx((i) => i + 1);
  };
  const goBack = () => {
    if (stepIdx === 0) router.back();
    else setStepIdx((i) => i - 1);
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top + SPACING.sm }]}>
      {/* Top bar */}
      <View style={styles.top}>
        <Pressable style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={goBack}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{t('portal.reportIssue', 'Report an issue')}</Text>
          <Text style={[styles.topStep, { color: colors.textMuted }]}>
            {t('portal.stepOf', 'Step {{n}} of {{total}}', { n: stepIdx + 1, total: steps.length })}
          </Text>
        </View>
      </View>
      {/* Progress */}
      <View style={[styles.progress, { backgroundColor: colors.surfaceRaised }]}>
        <View style={[styles.progressFill, { width: `${((stepIdx + 1) / steps.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {step === 'category' && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.whatProblem', 'What’s the problem?')}</Text>
            {categories.map((c, i) => (
              <Option
                key={c.key}
                selected={catIdx === i}
                colors={colors}
                onPress={() => {
                  setCatIdx(i);
                  setIssue(null);
                }}
                left={
                  <View style={[styles.optIcon, { backgroundColor: portalTint(c.color) }]}>
                    <MaterialCommunityIcons name={portalIcon(c.icon)} size={18} color={portalColor(c.color)} />
                  </View>
                }
                label={c.label}
                badge={c.urgent ? t('portal.priority', 'Priority') : undefined}
              />
            ))}
          </>
        )}

        {step === 'issue' && category && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.selectIssue', 'Select the issue')}</Text>
            {category.team ? (
              <View style={[styles.smartChip, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="navigate" size={13} color={COLORS.primaryDark} />
                <Text style={[styles.smartText, { color: COLORS.primaryDark }]}>
                  {t('portal.routing', 'Routed to')} {category.team}
                </Text>
              </View>
            ) : null}
            {category.issues.map((iss) => (
              <Option key={iss} selected={issue === iss} colors={colors} onPress={() => setIssue(iss)} label={iss} />
            ))}
          </>
        )}

        {step === 'describe' && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.describe', 'Describe it')}</Text>
            <TextInput
              style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder={t('portal.describePlaceholder', 'What happened, and when? Add anything useful…')}
              placeholderTextColor={colors.textMuted}
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </>
        )}

        {step === 'access' && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.access', 'Can we enter if you’re out?')}</Text>
            <Option selected={access === true} colors={colors} onPress={() => setAccess(true)} label={t('portal.accessYes', 'Yes, entry permitted')} />
            <Option selected={access === false} colors={colors} onPress={() => setAccess(false)} label={t('portal.accessNo', 'No, I’ll be there')} />
          </>
        )}

        {step === 'location' && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.location', 'Where is it?')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder={t('portal.locationPlaceholder', 'Room / floor / area')}
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
            />
          </>
        )}

        {step === 'time' && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.preferredTime', 'Preferred time')}</Text>
            {(['MORNING', 'AFTERNOON', 'EVENING'] as const).map((tm) => (
              <Option key={tm} selected={time === tm} colors={colors} onPress={() => setTime(tm)} label={t(`portal.time.${tm}`, tm)} />
            ))}
          </>
        )}

        {step === 'contact' && (
          <>
            <Text style={[styles.q, { color: colors.textPrimary }]}>{t('portal.contactHow', 'How should we reach you?')}</Text>
            {(['PUSH', 'EMAIL', 'PHONE'] as const).map((cp) => (
              <Option key={cp} selected={contact === cp} colors={colors} onPress={() => setContact(cp)} label={t(`portal.contactPref.${cp}`, cp)} />
            ))}
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          style={[styles.cta, { backgroundColor: canNext && !submit.isPending ? COLORS.primary : colors.borderLight }]}
          disabled={!canNext || submit.isPending}
          onPress={goNext}
        >
          {submit.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{isLast ? t('portal.submit', 'Submit request') : t('common.next', 'Next')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Option({
  selected,
  onPress,
  label,
  left,
  badge,
  colors,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  left?: React.ReactNode;
  badge?: string;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.opt,
        { backgroundColor: selected ? colors.primaryLight : colors.card, borderColor: selected ? COLORS.primary : colors.border },
      ]}
    >
      {left}
      <Text style={[styles.optLabel, { color: colors.textPrimary }]}>{label}</Text>
      {badge ? (
        <View style={styles.optBadge}>
          <Text style={styles.optBadgeText}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={selected ? COLORS.primary : colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-start' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  back: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg },
  topStep: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 1 },
  progress: { height: 6, borderRadius: 4, marginHorizontal: SPACING.lg, marginVertical: SPACING.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  q: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xxl, marginHorizontal: SPACING.lg, marginBottom: SPACING.md },
  smartChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: SPACING.lg, marginBottom: SPACING.md, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  smartText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 13, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: 13, borderRadius: RADIUS.md, borderWidth: 1 },
  optIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optLabel: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  optBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  optBadgeText: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#B91C1C' },
  textarea: { minHeight: 120, marginHorizontal: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, padding: 14, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, textAlignVertical: 'top' },
  input: { marginHorizontal: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, padding: 14, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.lg, paddingBottom: SPACING.xxl, borderTopWidth: 1 },
  cta: { borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, color: '#fff' },
});
