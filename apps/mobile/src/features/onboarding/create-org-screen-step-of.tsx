import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { LinearGradient } from 'expo-linear-gradient';
import { INDUSTRY_CARDS, AREAS } from '@hbcfield/shared/client';
import { useScreenWidth } from '@/components/screen-container';
import { COLORS, SPACING } from '@/lib/constants';
import { ionicon, TOTAL_STEPS, Kicker, Chip, SummaryRow, styles } from './create-org-screen-helpers';
import type { CreateOrgScreenState } from './use-create-org-screen-logic';

/** Part of CreateOrgScreen's markup, moved here unchanged; it reads the page's state from `vm`. */
export function CreateOrgScreenStepOf({ vm }: { vm: CreateOrgScreenState }) {
  const {
    insets,
    onBack,
    isLoading,
    colors,
    t,
    step,
    text,
    onType,
    plan,
    fromText,
    industryLabel,
    areaLabel,
    tools,
    toolLabel,
    confirmText,
    tapIndustry,
    areaNames,
    renameArea,
    removeArea,
    confirmAreas,
    firstName,
    orgName,
    setOrgName,
    handleCreate,
  } = vm;
  const wide = useScreenWidth();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[{ flex: 1 }, wide]}>
        {/* Header: back + progress */}
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={isLoading}>
            <Icon name="backLine" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.progress, { color: colors.textMuted }]}>
            {t('setup.stepOf', { step: step + 1, total: TOTAL_STEPS })}
          </Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { backgroundColor: COLORS.primary, width: `${((step + 1) / TOTAL_STEPS) * 100}%` },
            ]}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* ---- Step 0: what you do ---- */}
          {step === 0 && (
            <View>
              <Kicker colors={colors} icon="sparkles" text={t('setup.work.kicker')} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t('setup.work.title')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('setup.work.sub')}</Text>

              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <View
                  style={[
                    styles.inputIcon,
                    { backgroundColor: colors.surfaceRaised, borderRightColor: colors.inputBorder },
                  ]}
                >
                  <Icon name="edit" size={18} color={colors.textMuted} />
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
                    <Icon name="sparkles" size={13} color={COLORS.primaryDark} />
                    <Text style={[styles.eyebrow, { color: COLORS.primaryDark }]}>
                      {t('setup.work.understoodEyebrow')}
                    </Text>
                  </View>
                  <View style={styles.understoodTitleRow}>
                    <View style={[styles.understoodIcon, { backgroundColor: COLORS.primaryLight }]}>
                      <Icon name={ionicon(plan.industryIcon)} size={19} color={COLORS.primaryDark} />
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
                    <LinearGradient
                      colors={[COLORS.primary, COLORS.primaryDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryBtnGrad}
                    >
                      <Text style={styles.primaryBtnText}>{t('setup.work.continue')}</Text>
                      <Icon name="arrowRight" size={18} color={COLORS.white} />
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
                      style={[
                        styles.card,
                        {
                          borderColor: on ? COLORS.primary : colors.inputBorder,
                          backgroundColor: on ? COLORS.primaryLight : colors.card,
                        },
                      ]}
                      onPress={() => tapIndustry(ind.key)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.cardIcon, { backgroundColor: on ? COLORS.primary : colors.surfaceRaised }]}>
                        <Icon name={ionicon(ind.icon)} size={20} color={on ? COLORS.white : colors.textSecondary} />
                      </View>
                      <Text
                        style={[styles.cardLabel, { color: on ? COLORS.primaryDark : colors.textPrimary }]}
                        numberOfLines={2}
                      >
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
                  <View
                    key={i}
                    style={[styles.areaRow, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}
                  >
                    <View style={[styles.areaIcon, { backgroundColor: colors.surfaceRaised }]}>
                      <Icon name="folder" size={16} color={colors.textSecondary} />
                    </View>
                    <TextInput
                      style={[styles.areaInput, { color: colors.textPrimary }]}
                      value={n}
                      onChangeText={(v) => renameArea(i, v)}
                      placeholder={t('setup.mobile.areaNamePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity onPress={() => removeArea(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="closeCircle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={confirmAreas} activeOpacity={0.9}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtnGrad}
                >
                  <Text style={styles.primaryBtnText}>{t('setup.group.looksGood')}</Text>
                  <Icon name="arrowRight" size={18} color={COLORS.white} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ---- Step 2: name + confirm ---- */}
          {step === 2 && plan && (
            <View>
              <Kicker colors={colors} icon="checkCircle" text={t('setup.mobile.almostThere')} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {t('setup.mobile.nameTitle', { name: firstName })}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('setup.mobile.nameSub')}</Text>

              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.createOrg.nameLabel')}</Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.singleLine,
                  { backgroundColor: colors.card, borderColor: colors.inputBorder },
                ]}
              >
                <View
                  style={[
                    styles.inputIcon,
                    { backgroundColor: colors.surfaceRaised, borderRightColor: colors.inputBorder },
                  ]}
                >
                  <Icon name="workspaces" size={18} color={colors.textMuted} />
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
                <SummaryRow
                  colors={colors}
                  icon={ionicon(plan.industryIcon)}
                  title={t('setup.mobile.summaryIndustry')}
                  detail={industryLabel(plan.industryKey, plan.industryLabel)}
                />
                <SummaryRow
                  colors={colors}
                  icon="folder"
                  title={t('setup.done.areasTitle')}
                  detail={areaNames.filter((n) => n.trim()).join(' · ')}
                />
                <SummaryRow
                  colors={colors}
                  icon="tools"
                  title={t('setup.done.toolsTitle')}
                  detail={tools.map((tl) => toolLabel(tl.key)).join(' · ')}
                  last
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                onPress={handleCreate}
                disabled={isLoading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={isLoading ? [COLORS.slate400, COLORS.slate500] : [COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtnGrad}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <Text style={styles.primaryBtnText}>{t('setup.mobile.createButton')}</Text>
                      <Icon name="checkLine" size={18} color={COLORS.white} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
