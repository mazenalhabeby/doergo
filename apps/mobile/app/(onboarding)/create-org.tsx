import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CreateOrgIcon } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { onboardingApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

export default function CreateOrgScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Organization name is required'); return; }
    if (trimmedName.length < 2) { setError('Name must be at least 2 characters'); return; }

    setIsLoading(true);
    setError('');
    try {
      await onboardingApi.createOrganization({
        name: trimmedName,
        address: address.trim() || undefined,
      });
      await refreshUser();
      // Navigation guard will redirect to /(app)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create organization';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
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
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.iconGradient}>
              <CreateOrgIcon size={38} color={COLORS.white} variant="solid" contrastColor={COLORS.primary} />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Create Organization</Text>
          <Text style={styles.subtitle}>Set up your company on Doergo</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Organization name *</Text>
              <View style={[styles.inputContainer, error ? styles.inputError : null]}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="business-outline" size={18} color={COLORS.slate500} />
                </View>
                <TextInput style={styles.input} placeholder="Acme Inc." placeholderTextColor={COLORS.slate400}
                  value={name} onChangeText={(t) => { setName(t); setError(''); }} autoCapitalize="words" />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address (optional)</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="location-outline" size={18} color={COLORS.slate500} />
                </View>
                <TextInput style={styles.input} placeholder="123 Business Ave" placeholderTextColor={COLORS.slate400}
                  value={address} onChangeText={setAddress} autoCapitalize="words" />
              </View>
            </View>
          </View>

          <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleCreate} disabled={isLoading} activeOpacity={0.9}>
            <LinearGradient colors={isLoading ? [COLORS.slate400, COLORS.slate500] : [COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
              {isLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Create Organization</Text>}
            </LinearGradient>
          </TouchableOpacity>
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
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.slate200, height: 48, overflow: 'hidden',
  },
  inputError: { borderColor: '#fca5a5' },
  inputIconContainer: {
    width: 44, height: '100%', justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.slate50, borderRightWidth: 1, borderRightColor: COLORS.slate200,
  },
  input: { flex: 1, fontSize: FONT_SIZE.lg, color: COLORS.slate800, paddingHorizontal: SPACING.md },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error },
  button: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  buttonDisabled: { shadowOpacity: 0.1 },
  buttonGradient: { height: 50, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
