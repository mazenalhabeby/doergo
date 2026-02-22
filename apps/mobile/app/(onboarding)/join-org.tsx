import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { JoinOrgIcon } from '../../src/components';
import { onboardingApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, ROUTES } from '../../src/lib/constants';

export default function JoinOrgScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; organizationName?: string; message?: string } | null>(null);
  const [error, setError] = useState('');

  const handleValidate = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 8) { setError('Code must be 8 characters'); return; }

    setIsValidating(true);
    setError('');
    try {
      const result = await onboardingApi.validateOrgCode(trimmedCode);
      setValidation(result);
      if (!result.valid) setError(result.message || 'Invalid code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate code');
      setValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!validation?.valid) return;
    setIsSubmitting(true);
    try {
      await onboardingApi.submitJoinRequest({
        orgCode: code.trim().toUpperCase(),
        message: message.trim() || undefined,
      });
      router.replace(ROUTES.pendingApproval as Href);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
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
            <LinearGradient colors={['#7c3aed', '#6d28d9']} style={styles.iconGradient}>
              <JoinOrgIcon size={38} color={COLORS.white} variant="solid" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Join Organization</Text>
          <Text style={styles.subtitle}>Enter the organization code shared by your employer</Text>

          <View style={styles.form}>
            {/* Code Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Organization code</Text>
              <View style={styles.codeRow}>
                <View style={[styles.inputContainer, styles.codeInputContainer, error ? styles.inputError : null]}>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="ABCD1234"
                    placeholderTextColor={COLORS.slate400}
                    value={code}
                    onChangeText={(t) => { setCode(t.toUpperCase()); setError(''); setValidation(null); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.verifyButton, (isValidating || code.trim().length !== 8) && styles.verifyButtonDisabled]}
                  onPress={handleValidate}
                  disabled={isValidating || code.trim().length !== 8}
                >
                  {isValidating ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.verifyButtonText}>Verify</Text>}
                </TouchableOpacity>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {/* Validation Badge */}
            {validation?.valid && (
              <View style={styles.validBadge}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.validBadgeText}>{validation.organizationName}</Text>
              </View>
            )}

            {/* Message */}
            {validation?.valid && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Message (optional)</Text>
                <View style={[styles.inputContainer, styles.textAreaContainer]}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Introduce yourself..."
                    placeholderTextColor={COLORS.slate400}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                  />
                </View>
                <Text style={styles.charCount}>{message.length}/500</Text>
              </View>
            )}
          </View>

          {validation?.valid && (
            <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={isSubmitting} activeOpacity={0.9}>
              <LinearGradient colors={isSubmitting ? [COLORS.slate400, COLORS.slate500] : ['#7c3aed', '#6d28d9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                {isSubmitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Request to Join</Text>}
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
  inputContainer: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.slate200, overflow: 'hidden',
  },
  codeInputContainer: { flex: 1, height: 48, justifyContent: 'center' },
  inputError: { borderColor: '#fca5a5' },
  codeInput: {
    fontSize: 20, color: COLORS.slate800, paddingHorizontal: SPACING.md, letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center',
  },
  verifyButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, height: 48, justifyContent: 'center', alignItems: 'center' },
  verifyButtonDisabled: { backgroundColor: COLORS.slate300 },
  verifyButtonText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error },
  validBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md,
    backgroundColor: COLORS.successLight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.successBorder,
  },
  validBadgeText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: COLORS.slate800 },
  textAreaContainer: { height: 100 },
  textArea: { flex: 1, fontSize: FONT_SIZE.lg, color: COLORS.slate800, padding: SPACING.md },
  charCount: { fontSize: FONT_SIZE.xs, color: COLORS.slate400, textAlign: 'right' },
  button: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  buttonDisabled: { shadowOpacity: 0.1 },
  buttonGradient: { height: 50, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
