import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { InvitationIcon } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { onboardingApi, invitationsApi, type InvitationValidation } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

export default function UseInvitationScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [validation, setValidation] = useState<InvitationValidation | null>(null);
  const [error, setError] = useState('');

  const handleValidate = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length < 6) { setError('Code must be at least 6 characters'); return; }

    setIsValidating(true);
    setError('');
    try {
      const result = await invitationsApi.validate(trimmedCode);
      setValidation(result);
      if (!result.valid) setError(result.message || 'Invalid or expired code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate code');
      setValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAccept = async () => {
    if (!validation?.valid) return;
    setIsAccepting(true);
    try {
      await onboardingApi.acceptInvitation(code.trim().toUpperCase());
      await refreshUser();
      // Navigation guard will redirect to /(app)
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.slate700} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <LinearGradient colors={['#059669', '#047857']} style={styles.iconGradient}>
              <InvitationIcon size={38} color={COLORS.white} variant="solid" contrastColor="#059669" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Use Invitation Code</Text>
          <Text style={styles.subtitle}>Enter the code shared by your organization admin</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Invitation code</Text>
              <View style={styles.codeRow}>
                <View style={[styles.inputContainer, styles.codeInputContainer, error ? styles.inputError : null]}>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="XK7M2P"
                    placeholderTextColor={COLORS.slate400}
                    value={code}
                    onChangeText={(t) => { setCode(t.toUpperCase()); setError(''); setValidation(null); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.verifyButton, (isValidating || code.trim().length < 6) && styles.verifyButtonDisabled]}
                  onPress={handleValidate}
                  disabled={isValidating || code.trim().length < 6}
                >
                  {isValidating ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.verifyButtonText}>Verify</Text>}
                </TouchableOpacity>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {validation?.valid && (
              <View style={styles.validBadge}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <View style={styles.validInfo}>
                  <Text style={styles.validOrg}>{validation.organizationName}</Text>
                  <Text style={styles.validRole}>Joining as {validation.targetRole?.toLowerCase()}</Text>
                </View>
              </View>
            )}
          </View>

          {validation?.valid && (
            <TouchableOpacity style={[styles.button, isAccepting && styles.buttonDisabled]} onPress={handleAccept} disabled={isAccepting} activeOpacity={0.9}>
              <LinearGradient colors={isAccepting ? [COLORS.slate400, COLORS.slate500] : ['#059669', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                {isAccepting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Accept & Join</Text>}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.slate50 },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  iconContainer: { alignItems: 'center', marginVertical: SPACING.xl },
  iconGradient: { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: FONT_WEIGHT.bold, color: COLORS.slate800, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: FONT_SIZE.lg, color: COLORS.slate500, textAlign: 'center', marginBottom: SPACING.xl },
  form: { gap: SPACING.lg },
  inputGroup: { gap: SPACING.sm },
  label: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.slate700 },
  codeRow: { flexDirection: 'row', gap: SPACING.sm },
  inputContainer: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.slate200, overflow: 'hidden' },
  codeInputContainer: { flex: 1, height: 48, justifyContent: 'center' },
  inputError: { borderColor: '#fca5a5' },
  codeInput: {
    fontSize: 20, color: COLORS.slate800, paddingHorizontal: SPACING.md, letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center',
  },
  verifyButton: { backgroundColor: '#059669', borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, height: 48, justifyContent: 'center', alignItems: 'center' },
  verifyButtonDisabled: { backgroundColor: COLORS.slate300 },
  verifyButtonText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error },
  validBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md,
    backgroundColor: COLORS.successLight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.successBorder,
  },
  validInfo: { flex: 1 },
  validOrg: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: COLORS.slate800 },
  validRole: { fontSize: FONT_SIZE.sm, color: COLORS.slate600, marginTop: 2 },
  button: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', shadowColor: '#059669', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  buttonDisabled: { shadowOpacity: 0.1 },
  buttonGradient: { height: 50, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
