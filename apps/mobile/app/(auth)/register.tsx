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
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/auth-context';
import { AnimatedLogo } from '../../src/components';
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

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const orb1Anim = useRef(new Animated.Value(0)).current;
  const orb2Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Anim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(orb1Anim, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Anim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(orb2Anim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const orb1TranslateY = orb1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const orb2TranslateY = orb2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 15] });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = 'Must contain an uppercase letter';
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = 'Must contain a lowercase letter';
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = 'Must contain a number';
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      const message = error instanceof Error ? error.message : 'Registration failed';
      Alert.alert('Registration Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const passwordChecks = [
    { label: '8+ chars', test: password.length >= 8 },
    { label: 'Uppercase', test: /[A-Z]/.test(password) },
    { label: 'Lowercase', test: /[a-z]/.test(password) },
    { label: 'Number', test: /[0-9]/.test(password) },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <StatusBar style="light" />

      {/* Premium Dark Header with Gradient */}
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
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
          <Text style={styles.welcomeText}>Create your account</Text>
          <Text style={styles.subtitleText}>Get started with Doergo</Text>
        </View>
      </LinearGradient>

      {/* Form Card */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formWrapper}>
        <View style={styles.formCard}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Name Fields */}
            <View style={styles.nameRow}>
              <View style={styles.halfInputGroup}>
                <Text style={styles.label}>First name</Text>
                <View style={[styles.inputContainer, errors.firstName && styles.inputError]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person-outline" size={18} color={COLORS.slate500} />
                  </View>
                  <TextInput style={styles.input} placeholder="John" placeholderTextColor={COLORS.slate400}
                    value={firstName} onChangeText={(t) => { setFirstName(t); clearError('firstName'); }} autoCapitalize="words"
                    autoComplete="given-name" textContentType="givenName" />
                </View>
                {errors.firstName && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.firstName}</Text></View>}
              </View>
              <View style={styles.halfInputGroup}>
                <Text style={styles.label}>Last name</Text>
                <View style={[styles.inputContainer, errors.lastName && styles.inputError]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person-outline" size={18} color={COLORS.slate500} />
                  </View>
                  <TextInput style={styles.input} placeholder="Doe" placeholderTextColor={COLORS.slate400}
                    value={lastName} onChangeText={(t) => { setLastName(t); clearError('lastName'); }} autoCapitalize="words"
                    autoComplete="family-name" textContentType="familyName" />
                </View>
                {errors.lastName && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.lastName}</Text></View>}
              </View>
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="mail-outline" size={18} color={COLORS.slate500} />
                </View>
                <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={COLORS.slate400}
                  value={email} onChangeText={(t) => { setEmail(t); clearError('email'); }}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                  autoComplete="email" textContentType="emailAddress" />
              </View>
              {errors.email && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.email}</Text></View>}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.slate500} />
                </View>
                <TextInput style={styles.input} placeholder="Min. 8 characters" placeholderTextColor={COLORS.slate400}
                  value={password} onChangeText={(t) => { setPassword(t); clearError('password'); }}
                  secureTextEntry={!showPassword} autoCapitalize="none"
                  autoComplete="new-password" textContentType="newPassword" />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.slate500} />
                </TouchableOpacity>
              </View>
              {errors.password && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.password}</Text></View>}
              {password.length > 0 && (
                <View style={styles.passwordChecks}>
                  {passwordChecks.map((check) => (
                    <View key={check.label} style={styles.checkItem}>
                      <Ionicons name={check.test ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={check.test ? COLORS.success : COLORS.slate400} />
                      <Text style={[styles.checkText, check.test && styles.checkTextSuccess]}>{check.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm password</Text>
              <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.slate500} />
                </View>
                <TextInput style={styles.input} placeholder="Re-enter password" placeholderTextColor={COLORS.slate400}
                  value={confirmPassword} onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
                  secureTextEntry={!showConfirmPassword} autoCapitalize="none"
                  autoComplete="new-password" textContentType="newPassword" />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.slate500} />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <View style={styles.errorContainer}><Ionicons name="alert-circle" size={12} color={COLORS.error} /><Text style={styles.errorText}>{errors.confirmPassword}</Text></View>}
            </View>

            {/* Terms */}
            <Text style={styles.termsText}>
              By creating an account, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>

            {/* Register Button */}
            <TouchableOpacity style={[styles.registerButton, isLoading && styles.registerButtonDisabled]} onPress={handleRegister} disabled={isLoading} activeOpacity={0.9}>
              <LinearGradient colors={isLoading ? [COLORS.slate400, COLORS.slate500] : [COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.registerButtonGradient}>
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Text style={styles.registerButtonText}>Create Account</Text>
                    <View style={styles.arrowContainer}>
                      <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Sign In Link */}
            <View style={styles.signInContainer}>
              <Text style={styles.signInText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.signInLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.slate50 },
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
    flex: 1, marginHorizontal: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.xl + 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 8,
  },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  nameRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  halfInputGroup: { flex: 1 },
  inputGroup: { marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.slate700, marginBottom: SPACING.sm },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderRadius: RADIUS.md + 2,
    borderWidth: 1.5, borderColor: COLORS.slate200, height: 52,
  },
  inputError: { borderColor: '#fca5a5', backgroundColor: COLORS.errorLight },
  inputIconContainer: {
    width: 48, height: '100%', justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.slate100, borderRightWidth: 1, borderRightColor: COLORS.slate200,
  },
  input: { flex: 1, fontSize: FONT_SIZE.xl, color: COLORS.slate800, paddingHorizontal: SPACING.md, height: '100%' },
  eyeButton: { paddingHorizontal: SPACING.md, height: '100%', justifyContent: 'center' },
  errorContainer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, gap: SPACING.xs },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error, fontWeight: FONT_WEIGHT.medium },
  passwordChecks: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkText: { fontSize: FONT_SIZE.xs, color: COLORS.slate400 },
  checkTextSuccess: { color: COLORS.success },
  termsText: { fontSize: FONT_SIZE.sm, color: COLORS.slate500, textAlign: 'center', lineHeight: 18, marginBottom: SPACING.lg },
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
  signInText: { fontSize: FONT_SIZE.base, color: COLORS.slate500 },
  signInLink: { fontSize: FONT_SIZE.base, color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
});
