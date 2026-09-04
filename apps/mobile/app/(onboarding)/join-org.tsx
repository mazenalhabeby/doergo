import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { JoinOrgIcon, ScreenContainer } from '../../src/components';
import { onboardingApi, invitationsApi } from '../../src/lib/api';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, ROUTES } from '../../src/lib/constants';
import { JOIN_CODE_MAX_LENGTH, joinCodeCandidates } from '@hbcfield/shared/client';

export default function JoinOrgScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { refreshUser } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; organizationName?: string; message?: string } | null>(null);
  const [error, setError] = useState('');
  /*
    Set when what was typed here turns out to be a personal invitation.

    Both onboarding cards say "code", so this screen receives invitation codes
    routinely. It used to cap the field at the organization code's 8 characters,
    so a 10-character invitation simply stopped going in — no error, no hint,
    just a keyboard that appeared to stop working. The field now takes the
    longest code either flow issues and this screen says what it found.
  */
  const [isInvitation, setIsInvitation] = useState<{ organizationName?: string } | null>(null);

  const handleValidate = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const candidates = joinCodeCandidates(trimmedCode, 'ORG');
    if (candidates.length === 0) { setError(t('onboarding.joinOrg.codeUnrecognized')); return; }

    setIsValidating(true);
    setError('');
    setIsInvitation(null);
    try {
      // In order: the code this screen is for, then the other kind. At 8
      // characters both are possible, so a code is only ever offered as an
      // invitation once it has failed as an organization code.
      for (const kind of candidates) {
        if (kind === 'ORG') {
          const result = await onboardingApi.validateOrgCode(trimmedCode);
          if (result.valid) { setValidation(result); return; }
          setValidation(result);
          continue;
        }
        const invite = await invitationsApi.validate(trimmedCode);
        if (invite?.valid) {
          setValidation(null);
          setIsInvitation({ organizationName: invite.organizationName });
          return;
        }
      }
      setError(t('onboarding.joinOrg.invalidCode'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.joinOrg.failedToValidate'));
      setValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!validation?.valid) return;
    setIsSubmitting(true);
    try {
      const result = await onboardingApi.submitJoinRequest({
        orgCode: code.trim().toUpperCase(),
        message: message.trim() || undefined,
      });
      if (result?.autoApproved) {
        // OPEN policy: auto-approved, refresh user and go to app
        await refreshUser();
        router.replace('/(app)' as Href);
      } else {
        router.replace(ROUTES.pendingApproval as Href);
      }
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('onboarding.joinOrg.failedToSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScreenContainer width="content">
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <LinearGradient colors={[COLORS.purple, COLORS.purpleDark]} style={styles.iconGradient}>
              <JoinOrgIcon size={38} color={COLORS.white} variant="solid" />
            </LinearGradient>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('onboarding.joinOrg.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('onboarding.joinOrg.subtitle')}</Text>

          <View style={styles.form}>
            {/* Code Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.joinOrg.codeLabel')}</Text>
              <View style={styles.codeRow}>
                <View style={[styles.inputContainer, styles.codeInputContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }, error ? styles.inputError : null]}>
                  <TextInput
                    style={[styles.codeInput, { color: colors.textPrimary }]}
                    placeholder={t('onboarding.joinOrg.codePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    value={code}
                    onChangeText={(t) => { setCode(t.toUpperCase()); setError(''); setValidation(null); setIsInvitation(null); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={JOIN_CODE_MAX_LENGTH}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.verifyButton, (isValidating || joinCodeCandidates(code, 'ORG').length === 0) && styles.verifyButtonDisabled]}
                  onPress={handleValidate}
                  disabled={isValidating || joinCodeCandidates(code, 'ORG').length === 0}
                >
                  {isValidating ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.verifyButtonText}>{t('common.verify')}</Text>}
                </TouchableOpacity>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {/* Validation Badge */}
            {validation?.valid && (
              <View style={[styles.validBadge, { backgroundColor: colors.successLight }]}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={[styles.validBadgeText, { color: colors.textPrimary }]}>{validation.organizationName}</Text>
              </View>
            )}

            {/*
              A personal invitation, typed on the organization screen.

              It carries straight on rather than telling the person to go back
              and start again: the code is already correct, and it is handed to
              the invitation screen so nobody retypes ten characters.
            */}
            {isInvitation && (
              <TouchableOpacity
                style={[styles.inviteFound, { backgroundColor: colors.card, borderColor: COLORS.primary }]}
                onPress={() => router.replace({ pathname: ROUTES.useInvitation, params: { code: code.trim().toUpperCase() } } as Href)}
                accessibilityRole="button"
              >
                <Ionicons name="mail-open-outline" size={20} color={COLORS.primary} />
                <View style={styles.inviteFoundText}>
                  <Text style={[styles.inviteFoundTitle, { color: colors.textPrimary }]}>
                    {t('onboarding.joinOrg.isInvitation', 'That is a personal invitation')}
                  </Text>
                  <Text style={[styles.inviteFoundBody, { color: colors.textSecondary }]}>
                    {isInvitation.organizationName
                      ? t('onboarding.joinOrg.isInvitationOrg', 'It joins you to {{org}} right away — no approval needed.', { org: isInvitation.organizationName })
                      : t('onboarding.joinOrg.isInvitationPlain', 'It joins you right away — no approval needed.')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {/* Message */}
            {validation?.valid && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.joinOrg.messageLabel')}</Text>
                <View style={[styles.inputContainer, styles.textAreaContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                  <TextInput
                    style={[styles.textArea, { color: colors.textPrimary }]}
                    placeholder={t('onboarding.joinOrg.messagePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                  />
                </View>
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{message.length}/500</Text>
              </View>
            )}
          </View>

          {validation?.valid && (
            <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={isSubmitting} activeOpacity={0.9}>
              <LinearGradient colors={isSubmitting ? [COLORS.slate400, COLORS.slate500] : [COLORS.purple, COLORS.purpleDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                {isSubmitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>{t('onboarding.joinOrg.submitButton')}</Text>}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
        </ScreenContainer>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  iconContainer: { alignItems: 'center', marginVertical: SPACING.xl },
  iconGradient: { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: FONT_WEIGHT.bold, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: FONT_SIZE.lg, textAlign: 'center', marginBottom: SPACING.xl },
  form: { gap: SPACING.lg },
  inputGroup: { gap: SPACING.sm },
  label: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  codeRow: { flexDirection: 'row', gap: SPACING.sm },
  inputContainer: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5, overflow: 'hidden',
  },
  codeInputContainer: { flex: 1, height: 48, justifyContent: 'center' },
  inputError: { borderColor: COLORS.errorBorder },
  codeInput: {
    fontSize: 20, paddingHorizontal: SPACING.md, letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center',
  },
  verifyButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, height: 48, justifyContent: 'center', alignItems: 'center' },
  verifyButtonDisabled: { backgroundColor: COLORS.slate300 },
  verifyButtonText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error },
  validBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.successBorder,
  },
  inviteFound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  inviteFoundText: { flex: 1 },
  inviteFoundTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  inviteFoundBody: { fontSize: FONT_SIZE.xs, marginTop: 2, lineHeight: 16 },
  validBadgeText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  textAreaContainer: { height: 100 },
  textArea: { flex: 1, fontSize: FONT_SIZE.lg, padding: SPACING.md },
  charCount: { fontSize: FONT_SIZE.xs, textAlign: 'right' },
  button: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', shadowColor: COLORS.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  buttonDisabled: { shadowOpacity: 0.1 },
  buttonGradient: { height: 50, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
