import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../src/contexts/toast-context';
import { AnimatedLogo, ScreenContainer } from '../../src/components';
import { useAuthAnimations } from '../../src/hooks/useAuthAnimations';
import { useTheme } from '../../src/contexts/theme-context';
import { passwordApi } from '../../src/lib/api/auth';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../src/lib/constants';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const { fadeAnim, slideAnim, orb1TranslateY, orb2TranslateY } = useAuthAnimations();

  const validate = () => {
    if (!email) {
      setError(t('validation.emailRequired'));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('validation.emailInvalid'));
      return false;
    }
    setError(undefined);
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      await passwordApi.forgotPassword(email.toLowerCase().trim());
      setIsSent(true);
    } catch {
      // Always show success to prevent email enumeration
      setIsSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient
        colors={[COLORS.slate900, COLORS.slate800, COLORS.slate900]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}
      >
        <Animated.View
          style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1TranslateY }] }]}
        >
          <LinearGradient
            colors={['rgba(37, 99, 235, 0.4)', 'rgba(37, 99, 235, 0)']}
            style={styles.orbGradient}
          />
        </Animated.View>
        <Animated.View
          style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2TranslateY }] }]}
        >
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0)']}
            style={styles.orbGradient}
          />
        </Animated.View>

        <View style={styles.gridOverlay} />

        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <AnimatedLogo size="large" variant="light" />
          </View>
          <View style={styles.divider} />
          <Text style={styles.welcomeText}>{t('auth.forgotPassword.title')}</Text>
          <Text style={styles.subtitleText}>{t('auth.forgotPassword.subtitle')}</Text>
        </View>
      </LinearGradient>

      {/* Form */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.formWrapper}
      >
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <ScreenContainer width="content">
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isSent ? (
              /* Success State */
              <View style={styles.successContainer}>
                <View style={styles.successIconContainer}>
                  <Ionicons name="mail-outline" size={48} color={COLORS.primary} />
                </View>
                <Text style={[styles.successTitle, { color: colors.textPrimary }]}>
                  {t('auth.forgotPassword.sentTitle')}
                </Text>
                <Text style={[styles.successText, { color: colors.textSecondary }]}>
                  {t('auth.forgotPassword.sentMessage')}
                </Text>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => router.back()}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.backButtonGradient}
                  >
                    <Text style={styles.backButtonText}>{t('auth.forgotPassword.backToLogin')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              /* Email Form */
              <>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>
                    {t('auth.forgotPassword.emailLabel')}
                  </Text>
                  <View
                    style={[
                      styles.inputContainer,
                      { backgroundColor: colors.input, borderColor: colors.inputBorder },
                      error && styles.inputError,
                    ]}
                  >
                    <View
                      style={[
                        styles.inputIconContainer,
                        { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder },
                      ]}
                    >
                      <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                    </View>
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary }]}
                      placeholder={t('auth.forgotPassword.emailPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        if (error) setError(undefined);
                      }}
                    />
                  </View>
                  {error && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={isLoading}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={isLoading ? [COLORS.infoBorder, COLORS.infoBorder] : [COLORS.primary, COLORS.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitButtonGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        {t('auth.forgotPassword.submitButton')}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Back to Login */}
                <View style={styles.backToLoginContainer}>
                  <Text style={[styles.backToLoginText, { color: colors.textSecondary }]}>
                    {t('auth.forgotPassword.rememberPassword')}
                  </Text>
                  <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backToLoginLink}>{t('auth.forgotPassword.signIn')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
          </ScreenContainer>
        </View>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          {t('auth.login.needHelp')}<Text style={styles.footerLink}>{t('auth.login.contactSupport')}</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 50,
    paddingHorizontal: SPACING.xxl,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    top: -40,
    right: -40,
    width: 160,
    height: 160,
  },
  orb2: {
    bottom: -20,
    left: -40,
    width: 140,
    height: 140,
  },
  orbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
    backgroundColor: 'transparent',
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 10,
  },
  logoContainer: {
    marginBottom: SPACING.md,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginVertical: SPACING.xl,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitleText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate400,
    textAlign: 'center',
  },
  formWrapper: {
    flex: 1,
    marginTop: -SPACING.xxl,
  },
  formCard: {
    flex: 1,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.xl + 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  scrollContent: {
    padding: SPACING.xxl,
  },
  inputGroup: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm + 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md + 2,
    borderWidth: 1.5,
    height: 56,
    overflow: 'hidden',
  },
  inputError: {
    borderColor: COLORS.errorBorder,
    backgroundColor: COLORS.errorLight,
  },
  inputIconContainer: {
    width: 52,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.xl,
    paddingHorizontal: SPACING.lg,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs + 2,
  },
  errorText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.error,
    fontWeight: FONT_WEIGHT.medium,
  },
  submitButton: {
    borderRadius: RADIUS.md + 2,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  submitButtonDisabled: {
    shadowOpacity: 0.1,
  },
  submitButtonGradient: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  backToLoginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  backToLoginText: {
    fontSize: FONT_SIZE.base,
  },
  backToLoginLink: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  successText: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  backButton: {
    width: '100%',
    borderRadius: RADIUS.md + 2,
    overflow: 'hidden',
  },
  backButtonGradient: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  footer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZE.base,
  },
  footerLink: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
