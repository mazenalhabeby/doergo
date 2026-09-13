import { useState, useRef, useEffect } from 'react';
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
import { useBiometricUnlock } from '../../src/hooks/use-biometric-unlock';
import { resolveCapability, getKeyOwner } from '../../src/lib/biometrics';
import { BlurSheet, SheetPanel, FingerprintIcon } from '../../src/components';
import { useToast } from '../../src/contexts/toast-context';
import { AnimatedLogo, centeredContent } from '../../src/components';
import { useResponsive } from '../../src/lib/responsive';
import { useAuthAnimations } from '../../src/hooks/useAuthAnimations';
import { useTheme } from '../../src/contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../src/lib/constants';

export default function LoginScreen() {
  const router = useRouter();
  const { login, refreshUser, signedOutByUser } = useAuth();
  const bio = useBiometricUnlock();
  const [offerBiometric, setOfferBiometric] = useState(false);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const r = useResponsive();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  /*
    The member chose the password over the fingerprint. Only meaningful while
    this phone holds a key; without one the form is the only screen there is.
  */
  const [usePassword, setUsePassword] = useState(false);

  const { colors, isDark } = useTheme();
  const toast = useToast();

  // Animations
  const { fadeAnim, slideAnim, orb1TranslateY, orb2TranslateY } = useAuthAnimations();

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = t('validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('validation.emailInvalid');
    }

    if (!password) {
      newErrors.password = t('validation.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('validation.passwordMinLength');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /*
    Prompt on open when this phone is bound.

    ⚠️ Once per mount, guarded by a ref. Re-prompting on every render — or on
    every foreground, which the capability refresh triggers — puts the OS sheet
    back up the instant somebody dismisses it to type their password, which
    reads as the app refusing to let them in.
  */
  const unlockAndEnter = async () => {
    if (await bio.unlock()) {
      await refreshUser();
      router.replace(ROUTES.home as Href);
    }
  };

  const promptedRef = useRef(false);
  useEffect(() => {
    /*
      ⚠️ Not straight after an explicit sign-out. Somebody who just tapped
      "Sign out" and is met by a fingerprint sheet is one touch from being
      signed straight back in. The button below stays; only the auto-prompt
      waits for a real launch.
    */
    if (!bio.canUnlock || promptedRef.current || signedOutByUser) return;
    promptedRef.current = true;
    void unlockAndEnter();
  }, [bio.canUnlock, signedOutByUser]);

  const handleLogin = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      await login(email.toLowerCase().trim(), password);
      /*
        Offer it once, here, and never again from a banner.

        This is the only moment the member has both a live session to bind and a
        reason to care — and `enroll()` needs that session, so an offer anywhere
        else would have to send them back through this screen anyway. Declined,
        the switch still lives in Account.
      */
      /*
        ⚠️ Resolved FRESH here, not read from hook state.

        The hook resolves asynchronously on mount, and a fast sign-in finishes
        first — so `bio.capability` is still null at this moment on exactly the
        launch where somebody is most likely to be offered this. Reading it gave
        a silent "no" and the offer never appeared.
      */
      const [cap, owner] = await Promise.all([resolveCapability(), getKeyOwner()]);
      /*
        ⚠️ Asked about THIS member, not "is anyone enrolled". `bio.enrolled` is
        resolved signed-out, so it is true for whoever's key is on the phone —
        which meant the member who tapped "Not Mike?" was never offered it.
      */
      const alreadyMine = !!owner && owner.email.toLowerCase() === email.toLowerCase().trim();
      if (cap.kind === 'ready' && !alreadyMine) {
        setOfferBiometric(true);
      } else {
        router.replace(ROUTES.home as Href);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.login.loginFailed');
      toast.error(t('auth.login.loginFailed'), message);
    } finally {
      setIsLoading(false);
    }
  };

  /*
    Fingerprint first when this phone holds a key; the form is one tap away.
    ⚠️ Nothing is drawn in the card until the capability has resolved — the
    first frame otherwise shows the form and swaps it for the fingerprint a
    moment later, which reads as the screen changing its mind.
  */
  const resolved = bio.capability !== null;
  const showBiometric = bio.canUnlock && !usePassword;
  const ownerName = bio.owner?.name?.trim().split(/\s+/)[0] || bio.owner?.email || '';
  const bioNotice =
    bio.failure === 'invalidated' ? t('biometrics.invalidatedBody', { method: bio.label })
      : bio.failure === 'rejected' ? t('biometrics.rejectedBody')
        : null;

  const switchToPassword = (sameAccount: boolean) => {
    setUsePassword(true);
    setEmail(sameAccount ? bio.owner?.email ?? '' : '');
    setPassword('');
    setErrors({});
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

      {/* Premium Dark Header with Gradient */}
      <LinearGradient
        colors={[COLORS.slate900, COLORS.slate800, COLORS.slate900]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}
      >
        {/* Animated Gradient Orbs */}
        <Animated.View
          style={[
            styles.orb,
            styles.orb1,
            { transform: [{ translateY: orb1TranslateY }] },
          ]}
        >
          <LinearGradient
            colors={['rgba(37, 99, 235, 0.4)', 'rgba(37, 99, 235, 0)']}
            style={styles.orbGradient}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.orb,
            styles.orb2,
            { transform: [{ translateY: orb2TranslateY }] },
          ]}
        >
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0)']}
            style={styles.orbGradient}
          />
        </Animated.View>

        {/* Grid Pattern Overlay */}
        <View style={styles.gridOverlay} />

        <View style={styles.headerContent}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <AnimatedLogo size="large" variant="light" />
          </View>

          {resolved && !showBiometric && (
            <>
              <View style={styles.divider} />
              <Text style={styles.welcomeText}>{t('auth.login.title')}</Text>
              <Text style={styles.subtitleText}>{t('auth.login.subtitle')}</Text>
            </>
          )}
        </View>
      </LinearGradient>

      {/* Form Card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.formWrapper}
      >
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              showBiometric && styles.scrollGrow,
              r.isTablet && centeredContent(460),
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!resolved ? null : showBiometric ? (
              <View style={styles.bioScreen}>
                <View style={styles.bioGreeting}>
                  <Text style={[styles.bioWelcome, { color: colors.textPrimary }]} numberOfLines={1}>
                    {t('biometrics.welcomeBack', { name: ownerName })}
                  </Text>
                  {/* ⚠️ A fingerprint cannot tell you whose account it opens.
                      The screen has to, or somebody signs in as a colleague
                      who used this phone before them and never notices. */}
                  {!!bio.owner?.email && (
                    <Text style={[styles.bioEmail, { color: colors.textMuted }]} numberOfLines={1}>
                      {bio.owner.email}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.bioCircle, { backgroundColor: colors.primaryLight, borderColor: COLORS.primary + '33' }]}
                  onPress={() => void unlockAndEnter()}
                  disabled={bio.busy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('biometrics.unlockWith', { method: bio.label })}
                >
                  {bio.busy ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <FingerprintIcon size={64} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
                <Text style={styles.bioTap}>{t('biometrics.tapToUnlock', { method: bio.label })}</Text>

                <View style={styles.bioSpacer} />

                <TouchableOpacity
                  style={[styles.bioPasswordButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={() => switchToPassword(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.bioPasswordText, { color: colors.textPrimary }]}>{t('biometrics.usePassword')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => switchToPassword(false)} style={styles.bioNotYou} hitSlop={8}>
                  <Text style={[styles.bioNotYouText, { color: colors.textSecondary }]}>
                    {t('biometrics.notYou', { name: ownerName })}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
            <>
            {/* One tap back to the fingerprint, for the member who owns it. */}
            {bio.canUnlock && (
              <TouchableOpacity
                style={[styles.bioBack, { backgroundColor: colors.primaryLight }]}
                onPress={() => setUsePassword(false)}
                activeOpacity={0.8}
              >
                <FingerprintIcon size={26} color={COLORS.primary} />
                <Text style={styles.bioBackText} numberOfLines={1}>
                  {t('biometrics.backTo', { method: bio.label, name: ownerName })}
                </Text>
              </TouchableOpacity>
            )}

            {/* Why the fingerprint went: said once, where the password goes. */}
            {!!bioNotice && (
              <View style={[styles.bioNotice, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
                <Text style={[styles.bioNoticeText, { color: colors.textSecondary }]}>{bioNotice}</Text>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.login.emailLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.email && { backgroundColor: colors.errorLight, borderColor: COLORS.error }]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder={t('auth.login.emailPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                />
              </View>
              {errors.email && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{errors.email}</Text>
                </View>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('auth.login.passwordLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }, errors.password && { backgroundColor: colors.errorLight, borderColor: COLORS.error }]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.inputIconBg, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{errors.password}</Text>
                </View>
              )}
            </View>

            {/* Forgot Password */}
            <TouchableOpacity
              onPress={() => router.push(ROUTES.forgotPassword as Href)}
              style={styles.forgotPasswordButton}
            >
              <Text style={styles.forgotPasswordText}>{t('auth.login.forgotPassword')}</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={isLoading ? [COLORS.infoBorder, COLORS.infoBorder] : [COLORS.primary, COLORS.inProgress]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <>
                    <Text style={styles.loginButtonText}>{t('auth.login.submitButton')}</Text>
                    <View style={styles.arrowContainer}>
                      <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Security Badges */}
            <View style={styles.securityContainer}>
              <View style={styles.securityBadge}>
                <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                <Text style={[styles.securityText, { color: colors.textMuted }]}>{t('auth.login.enterpriseProtected')}</Text>
              </View>
              <View style={[styles.securityDot, { backgroundColor: colors.border }]} />
              <View style={styles.securityBadge}>
                <Ionicons name="shield-checkmark" size={14} color={colors.textMuted} />
                <Text style={[styles.securityText, { color: colors.textMuted }]}>{t('auth.login.secure')}</Text>
              </View>
            </View>

            {/* Create Account Link */}
            <View style={styles.createAccountContainer}>
              <Text style={[styles.createAccountText, { color: colors.textSecondary }]}>{t('auth.login.noAccount')}</Text>
              <TouchableOpacity onPress={() => router.push(ROUTES.register as Href)}>
                <Text style={styles.createAccountLink}>{t('auth.login.createOne')}</Text>
              </TouchableOpacity>
            </View>
            </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          {t('auth.login.needHelp')}<Text style={styles.footerLink}>{t('auth.login.contactSupport')}</Text>
        </Text>
      </View>
    {/*
      Asked once, never again from a banner. Either answer leaves for home, so
      there is no way to get stuck behind it.
    */}
    <BlurSheet visible={offerBiometric} onClose={() => { setOfferBiometric(false); router.replace(ROUTES.home as Href); }}>
      <SheetPanel onClose={() => { setOfferBiometric(false); router.replace(ROUTES.home as Href); }}>
        <View style={styles.offerBody}>
          <View style={[styles.offerIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="finger-print" size={30} color={COLORS.primary} />
          </View>
          <Text style={[styles.offerTitle, { color: colors.textPrimary }]}>
            {t('biometrics.enableTitle', { method: bio.label })}
          </Text>
          <Text style={[styles.offerText, { color: colors.textSecondary }]}>
            {t('biometrics.enableBody')}
          </Text>
          <TouchableOpacity
            style={styles.offerPrimary}
            disabled={bio.busy}
            onPress={async () => {
              await bio.enroll();
              setOfferBiometric(false);
              router.replace(ROUTES.home as Href);
            }}
          >
            <Text style={styles.offerPrimaryText}>{t('biometrics.enable', { method: bio.label })}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.offerGhost, { borderColor: colors.border }]}
            onPress={() => { setOfferBiometric(false); router.replace(ROUTES.home as Href); }}
          >
            <Text style={[styles.offerGhostText, { color: colors.textPrimary }]}>{t('biometrics.notNow')}</Text>
          </TouchableOpacity>
        </View>
      </SheetPanel>
    </BlurSheet>
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
  tagline: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate500,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: SPACING.xs,
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
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitleText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate400,
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
  eyeButton: {
    paddingHorizontal: SPACING.lg,
    height: '100%',
    justifyContent: 'center',
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
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.lg,
    marginTop: -SPACING.sm,
  },
  forgotPasswordText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },
  loginButton: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md + 2,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  loginButtonDisabled: {
    shadowOpacity: 0.1,
  },
  loginButtonGradient: {
    flexDirection: 'row',
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  arrowContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerBody: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, alignItems: 'center' },
  offerIcon: { width: 62, height: 62, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  offerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, textAlign: 'center' },
  offerText: { fontSize: FONT_SIZE.base, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 21 },
  offerPrimary: { alignSelf: 'stretch', backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.xl },
  offerPrimaryText: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.semibold },
  offerGhost: { alignSelf: 'stretch', borderRadius: RADIUS.md, borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  offerGhostText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.medium },
  scrollGrow: { flexGrow: 1 },
  bioScreen: { flexGrow: 1, alignItems: 'center' },
  bioGreeting: { alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.xxl, maxWidth: '100%' },
  bioWelcome: { fontSize: 22, fontWeight: FONT_WEIGHT.bold, letterSpacing: -0.2 },
  bioEmail: { fontSize: FONT_SIZE.base, marginTop: 2 },
  bioCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioTap: {
    marginTop: SPACING.lg,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
    textAlign: 'center',
  },
  bioSpacer: { flexGrow: 1, minHeight: SPACING.xxl },
  bioPasswordButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: RADIUS.md + 2,
    borderWidth: 1,
  },
  bioPasswordText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  bioNotYou: { marginTop: SPACING.md, paddingVertical: SPACING.xs },
  bioNotYouText: { fontSize: FONT_SIZE.base, textDecorationLine: 'underline', textAlign: 'center' },
  bioBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md + 2,
    marginBottom: SPACING.xl,
  },
  bioBackText: { flex: 1, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: COLORS.primary },
  bioNotice: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xl,
  },
  bioNoticeText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 18 },
  securityContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xxl,
    gap: SPACING.md,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  securityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  securityText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  createAccountContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  createAccountText: {
    fontSize: FONT_SIZE.base,
  },
  createAccountLink: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
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
