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
import { useAuth } from '../../src/contexts/auth-context';
import { useToast } from '../../src/contexts/toast-context';
import { AnimatedLogo, centeredContent } from '../../src/components';
import { useResponsive } from '../../src/lib/responsive';
import { useAuthAnimations } from '../../src/hooks/useAuthAnimations';
import { useTheme } from '../../src/contexts/theme-context';
import { authApi } from '../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../src/lib/constants';

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const r = useResponsive();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const { colors, isDark } = useTheme();
  const toast = useToast();

  // Animations
  const { fadeAnim, slideAnim, orb1TranslateY, orb2TranslateY } = useAuthAnimations();

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!firstName.trim()) newErrors.firstName = t('validation.firstNameRequired');
    if (!lastName.trim()) newErrors.lastName = t('validation.lastNameRequired');
    if (!email) {
      newErrors.email = t('validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('validation.emailInvalid');
    }
    if (!password) {
      newErrors.password = t('validation.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('validation.passwordMinLength');
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = t('validation.passwordUppercase');
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = t('validation.passwordLowercase');
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = t('validation.passwordNumber');
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = t('validation.confirmPasswordRequired');
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = t('validation.passwordsMismatch');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const trimmedEmail = email.toLowerCase().trim();
      // Register without company name → creates orphan user → navigation guard redirects to onboarding
      await authApi.register({
        email: trimmedEmail,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      // Auto-login → navigation guard handles routing to onboarding or app
      await login(trimmedEmail, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.register.registrationFailed');
      toast.error(t('auth.register.registrationFailed'), message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const passwordChecks = [
    { label: t('auth.register.passwordChecks.minChars'), test: password.length >= 8 },
    { label: t('auth.register.passwordChecks.uppercase'), test: /[A-Z]/.test(password) },
    { label: t('auth.register.passwordChecks.lowercase'), test: /[a-z]/.test(password) },
    { label: t('auth.register.passwordChecks.number'), test: /[0-9]/.test(password) },
  ];

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.surface, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <StatusBar style="light" />

      {/* Premium Dark Header with Gradient */}
      <LinearGradient
        colors={[COLORS.slate900, COLORS.slate800, COLORS.slate900]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + SPACING.lg }]}
      >
        <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1TranslateY }] }]}>
          <LinearGradient colors={['rgba(37, 99, 235, 0.4)', 'rgba(37, 99, 235, 0)']} style={styles.orbGradient} />
        </Animated.View>
        <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2TranslateY }] }]}>
          <LinearGradient colors={['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0)']} style={styles.orbGradient} />
        </Animated.View>
        <View style={styles.gridOverlay} />
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <AnimatedLogo size="default" variant="light" />
          </View>
          <View style={styles.divider} />
          <Text style={styles.welcomeText}>{t('auth.register.title')}</Text>
          <Text style={styles.subtitleText}>{t('auth.register.subtitle')}</Text>
        </View>
      </LinearGradient>

      {/* Form Card */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formWrapper}>
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <ScrollView contentContainerStyle={[styles.scrollContent, r.isTablet && centeredContent(460)]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Name Fields */}
            <View style={styles.nameRow}>
              <View style={styles.halfInputGroup}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.register.firstNameLabel')}</Text>
                <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.firstName && styles.inputError]}>
                  <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                    <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                  </View>
                  <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('auth.register.firstNamePlaceholder')} placeholderTextColor={colors.textMuted}
                    value={firstName} onChangeText={(t) => { setFirstName(t); clearError('firstName'); }} autoCapitalize="words"
                    autoComplete="given-name" textContentType="givenName" />
                </View>
                {errors.firstName && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.firstName}</Text></View>}
              </View>
              <View style={styles.halfInputGroup}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.register.lastNameLabel')}</Text>
                <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.lastName && styles.inputError]}>
                  <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                    <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                  </View>
                  <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('auth.register.lastNamePlaceholder')} placeholderTextColor={colors.textMuted}
                    value={lastName} onChangeText={(t) => { setLastName(t); clearError('lastName'); }} autoCapitalize="words"
                    autoComplete="family-name" textContentType="familyName" />
                </View>
                {errors.lastName && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.lastName}</Text></View>}
              </View>
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.register.emailLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.email && styles.inputError]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
                </View>
                <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('auth.register.emailPlaceholder')} placeholderTextColor={colors.textMuted}
                  value={email} onChangeText={(t) => { setEmail(t); clearError('email'); }}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                  autoComplete="email" textContentType="emailAddress" />
              </View>
              {errors.email && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.email}</Text></View>}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.register.passwordLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.password && styles.inputError]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                </View>
                <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('auth.register.passwordPlaceholder')} placeholderTextColor={colors.textMuted}
                  value={password} onChangeText={(t) => { setPassword(t); clearError('password'); }}
                  secureTextEntry={!showPassword} autoCapitalize="none"
                  autoComplete="new-password" textContentType="newPassword" />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {errors.password && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.password}</Text></View>}
              {password.length > 0 && (
                <View style={styles.passwordChecks}>
                  {passwordChecks.map((check) => (
                    <View key={check.label} style={styles.checkItem}>
                      <Ionicons name={check.test ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={check.test ? COLORS.success : colors.textMuted} />
                      <Text style={[styles.checkText, { color: colors.textMuted }, check.test && styles.checkTextSuccess]}>{check.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.register.confirmPasswordLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.confirmPassword && styles.inputError]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                </View>
                <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('auth.register.confirmPasswordPlaceholder')} placeholderTextColor={colors.textMuted}
                  value={confirmPassword} onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
                  secureTextEntry={!showConfirmPassword} autoCapitalize="none"
                  autoComplete="new-password" textContentType="newPassword" />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.confirmPassword}</Text></View>}
            </View>

            {/* Terms */}
            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
              {t('auth.register.termsText')}
              <Text style={styles.termsLink}>{t('auth.register.termsOfService')}</Text>{t('auth.register.and')}
              <Text style={styles.termsLink}>{t('auth.register.privacyPolicy')}</Text>
            </Text>

            {/* Register Button */}
            <TouchableOpacity style={[styles.registerButton, isLoading && styles.registerButtonDisabled]} onPress={handleRegister} disabled={isLoading} activeOpacity={0.9}>
              <LinearGradient colors={isLoading ? [COLORS.slate400, COLORS.slate500] : [COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.registerButtonGradient}>
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Text style={styles.registerButtonText}>{t('auth.register.submitButton')}</Text>
                    <View style={styles.arrowContainer}>
                      <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Sign In Link */}
            <View style={styles.signInContainer}>
              <Text style={[styles.signInText, { color: colors.textSecondary }]}>{t('auth.register.hasAccount')}</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.signInLink}>{t('auth.register.signIn')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl + SPACING.lg,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
  },
  orb: { position: 'absolute', borderRadius: 999 },
  orb1: { top: -40, right: -40, width: 160, height: 160 },
  orb2: { bottom: -20, left: -40, width: 140, height: 140 },
  orbGradient: { width: '100%', height: '100%', borderRadius: 999 },
  gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.03, backgroundColor: 'transparent' },
  headerContent: { alignItems: 'center', zIndex: 10 },
  logoContainer: { marginBottom: SPACING.sm },
  divider: { width: 40, height: 3, backgroundColor: COLORS.primary, borderRadius: 2, marginVertical: SPACING.lg },
  welcomeText: { fontSize: 22, fontWeight: FONT_WEIGHT.bold, color: COLORS.white, marginBottom: SPACING.xs },
  subtitleText: { fontSize: FONT_SIZE.lg, color: COLORS.slate400 },
  formWrapper: { flex: 1, marginTop: -SPACING.xl },
  formCard: {
    flex: 1, marginHorizontal: SPACING.lg, borderRadius: RADIUS.xl + 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 8,
  },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  nameRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  halfInputGroup: { flex: 1 },
  inputGroup: { marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md + 2,
    borderWidth: 1.5, height: 52,
  },
  inputError: { borderColor: COLORS.errorBorder, backgroundColor: COLORS.errorLight },
  inputIconContainer: {
    width: 48, height: '100%', justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1,
  },
  input: { flex: 1, fontSize: FONT_SIZE.xl, paddingHorizontal: SPACING.md, height: '100%' },
  eyeButton: { paddingHorizontal: SPACING.md, height: '100%', justifyContent: 'center' },
  errorContainer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, gap: SPACING.xs },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error, fontWeight: FONT_WEIGHT.medium },
  passwordChecks: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkText: { fontSize: FONT_SIZE.xs },
  checkTextSuccess: { color: COLORS.success },
  termsText: { fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 18, marginBottom: SPACING.lg },
  termsLink: { color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
  registerButton: {
    borderRadius: RADIUS.md, overflow: 'hidden',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  registerButtonDisabled: { shadowOpacity: 0.1 },
  registerButtonGradient: { flexDirection: 'row', height: 50, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  registerButtonText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white, letterSpacing: 0.3 },
  arrowContainer: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  signInContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
  signInText: { fontSize: FONT_SIZE.base },
  signInLink: { fontSize: FONT_SIZE.base, color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
});
