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

const PRIMARY_COLOR = '#2563EB';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const orb1Anim = useRef(new Animated.Value(0)).current;
  const orb2Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Floating orb animations
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

  const orb1TranslateY = orb1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const orb2TranslateY = orb2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 15],
  });

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      await login(email.toLowerCase().trim(), password, rememberMe);
      router.replace('/(app)' as Href);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <StatusBar style="light" />

      {/* Premium Dark Header with Gradient */}
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 20 }]}
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

          <Text style={styles.tagline}>Worker Portal</Text>

          <View style={styles.divider} />

          <Text style={styles.welcomeText}>Welcome back</Text>
          <Text style={styles.subtitleText}>Sign in to access your tasks</Text>
        </View>
      </LinearGradient>

      {/* Form Card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.formWrapper}
      >
        <View style={styles.formCard}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="mail-outline" size={20} color="#64748b" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor="#94a3b8"
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
                  <Ionicons name="alert-circle" size={14} color="#ef4444" />
                  <Text style={styles.errorText}>{errors.email}</Text>
                </View>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748b" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
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
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#ef4444" />
                  <Text style={styles.errorText}>{errors.password}</Text>
                </View>
              )}
            </View>

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberContainer}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color="white" />}
              </View>
              <Text style={styles.rememberText}>Keep me signed in for 30 days</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={isLoading ? ['#93c5fd', '#93c5fd'] : [PRIMARY_COLOR, '#3b82f6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Text style={styles.loginButtonText}>Sign in</Text>
                    <View style={styles.arrowContainer}>
                      <Ionicons name="arrow-forward" size={18} color="white" />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Security Badges */}
            <View style={styles.securityContainer}>
              <View style={styles.securityBadge}>
                <Ionicons name="lock-closed" size={14} color="#94a3b8" />
                <Text style={styles.securityText}>Enterprise protected</Text>
              </View>
              <View style={styles.securityDot} />
              <View style={styles.securityBadge}>
                <Ionicons name="shield-checkmark" size={14} color="#94a3b8" />
                <Text style={styles.securityText}>Secure</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Text style={styles.footerText}>
          Need help? <Text style={styles.footerLink}>Contact support</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    paddingBottom: 50,
    paddingHorizontal: 24,
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
    marginBottom: 12,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 2,
    marginVertical: 20,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 15,
    color: '#94a3b8',
  },
  formWrapper: {
    flex: 1,
    marginTop: -24,
  },
  formCard: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  scrollContent: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    height: 56,
    overflow: 'hidden',
  },
  inputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  inputIconContainer: {
    width: 52,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    paddingHorizontal: 16,
  },
  eyeButton: {
    paddingHorizontal: 16,
    height: '100%',
    justifyContent: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  checkboxChecked: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  rememberText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: PRIMARY_COLOR,
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
    gap: 10,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
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
  securityContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  securityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  securityText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
  },
  footerLink: {
    color: PRIMARY_COLOR,
    fontWeight: '600',
  },
});
