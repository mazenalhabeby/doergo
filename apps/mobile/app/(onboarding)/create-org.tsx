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
import { useToast } from '../../src/island/island-context';
import { onboardingApi, locationsApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../src/lib/constants';
import { useCreateOrgScreen } from '../../src/screens/onboarding/use-create-org-screen';
import {
  ionicon,
  TOTAL_STEPS,
  Kicker,
  Chip,
  SummaryRow,
  styles,
} from '../../src/screens/onboarding/create-org-screen-helpers';

export default function CreateOrgScreen() {
  const {
    insets,
    colors,
    isDark,
    t,
    step,
    text,
    plan,
    fromText,
    areaNames,
    orgName,
    setOrgName,
    isLoading,
    areaLabel,
    toolLabel,
    industryLabel,
    tools,
    firstName,
    onType,
    tapIndustry,
    confirmText,
    renameArea,
    removeArea,
    confirmAreas,
    handleCreate,
    onBack,
  } = useCreateOrgScreen();

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
