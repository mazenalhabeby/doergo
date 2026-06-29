import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { CreateOrgIcon } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { onboardingApi, locationsApi } from '../../src/lib/api';
import { LocationSearchPicker } from '../../src/components/location-search-picker';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

export default function CreateOrgScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [firstSpaceName, setFirstSpaceName] = useState('Main Office');
  const [spaceType, setSpaceType] = useState<'workspace' | 'physical'>('workspace');
  const [spaceAddress, setSpaceAddress] = useState('');
  const [spaceLat, setSpaceLat] = useState<number | null>(null);
  const [spaceLng, setSpaceLng] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError(t('validation.organizationNameRequired')); return; }
    if (trimmedName.length < 2) { setError(t('validation.organizationNameMinLength')); return; }

    setIsLoading(true);
    setError('');
    try {
      await onboardingApi.createOrganization({
        name: trimmedName,
      });
      // Create the org's first space (becomes the default). A logical workspace;
      // it can be turned into a physical location later.
      try {
        await locationsApi.create({
          name: firstSpaceName.trim() || 'Main Office',
          address: spaceType === 'physical' ? spaceAddress.trim() || undefined : undefined,
          lat: spaceType === 'physical' ? spaceLat ?? undefined : undefined,
          lng: spaceType === 'physical' ? spaceLng ?? undefined : undefined,
        });
      } catch {
        // non-fatal — the user can create a space later
      }
      await refreshUser();
      // Navigation guard will redirect to /(app)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('onboarding.createOrg.failedToCreate');
      toast.error(t('common.error'), message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.iconGradient}>
              <CreateOrgIcon size={38} color={COLORS.white} variant="solid" contrastColor={COLORS.primary} />
            </LinearGradient>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('onboarding.createOrg.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('onboarding.createOrg.subtitle')}</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.createOrg.nameLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }, error ? styles.inputError : null]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.surfaceRaised, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="business-outline" size={18} color={colors.textMuted} />
                </View>
                <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('onboarding.createOrg.namePlaceholder')} placeholderTextColor={colors.textMuted}
                  value={name} onChangeText={(t) => { setName(t); setError(''); }} autoCapitalize="words" />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.createOrg.firstSpaceLabel', 'Your first space')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <View style={[styles.inputIconContainer, { backgroundColor: colors.surfaceRaised, borderRightColor: colors.inputBorder }]}>
                  <Ionicons name="grid-outline" size={18} color={colors.textMuted} />
                </View>
                <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder={t('onboarding.createOrg.firstSpacePlaceholder')} placeholderTextColor={colors.textMuted}
                  value={firstSpaceName} onChangeText={setFirstSpaceName} autoCapitalize="words" />
              </View>
              <Text style={[styles.errorText, { color: colors.textMuted }]}>{t('onboarding.createOrg.firstSpaceHint')}</Text>
            </View>

            {/* Space type */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.createOrg.typeLabel')}</Text>
              <View style={styles.typeRow}>
                {([
                  { key: 'workspace' as const, icon: 'grid-outline' as const, label: t('onboarding.createOrg.typeWorkspace'), desc: t('onboarding.createOrg.typeWorkspaceDesc') },
                  { key: 'physical' as const, icon: 'location-outline' as const, label: t('onboarding.createOrg.typePhysical'), desc: t('onboarding.createOrg.typePhysicalDesc') },
                ]).map((opt) => {
                  const on = spaceType === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.typeCard, { borderColor: on ? COLORS.primary : colors.inputBorder, backgroundColor: on ? COLORS.primaryLight : colors.card }]}
                      onPress={() => setSpaceType(opt.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={opt.icon} size={18} color={on ? COLORS.primary : colors.textMuted} />
                      <Text style={[styles.typeLabel, { color: on ? COLORS.primary : colors.textPrimary }]}>{opt.label}</Text>
                      <Text style={[styles.typeDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Physical location → address + map */}
            {spaceType === 'physical' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>{t('onboarding.createOrg.locationLabel')}</Text>
                <LocationSearchPicker
                  address={spaceAddress}
                  lat={spaceLat}
                  lng={spaceLng}
                  onLocationChange={(a, la, ln) => { setSpaceAddress(a); setSpaceLat(la); setSpaceLng(ln); }}
                />
              </View>
            )}
          </View>

          <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleCreate} disabled={isLoading} activeOpacity={0.9}>
            <LinearGradient colors={isLoading ? [COLORS.slate400, COLORS.slate500] : [COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
              {isLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>{t('onboarding.createOrg.submitButton')}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
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
  typeRow: { flexDirection: 'row', gap: SPACING.sm },
  typeCard: { flex: 1, borderWidth: 1.5, borderRadius: RADIUS.md, padding: SPACING.md, gap: 4 },
  typeLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginTop: 4 },
  typeDesc: { fontSize: FONT_SIZE.sm },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md,
    borderWidth: 1.5, height: 48, overflow: 'hidden',
  },
  inputError: { borderColor: COLORS.errorBorder },
  inputIconContainer: {
    width: 44, height: '100%', justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1,
  },
  input: { flex: 1, fontSize: FONT_SIZE.lg, paddingHorizontal: SPACING.md },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.error },
  button: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  buttonDisabled: { shadowOpacity: 0.1 },
  buttonGradient: { height: 50, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
