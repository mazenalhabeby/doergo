import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../src/lib/constants';
import { userApi } from '../../src/lib/api/auth';

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = firstName.trim() !== (user?.firstName ?? '') || lastName.trim() !== (user?.lastName ?? '');
  const valid = firstName.trim().length > 0 && lastName.trim().length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await userApi.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      await refreshUser();
      router.back();
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), e instanceof Error ? e.message : t('portal.saveFailed', 'Could not save your changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('portal.editProfile', 'Edit profile')}</Text>
        <Pressable onPress={save} disabled={!valid || !dirty || saving} hitSlop={10} style={styles.headerBtn}>
          {saving ? <ActivityIndicator color={COLORS.primary} /> : (
            <Text style={[styles.save, { color: valid && dirty ? COLORS.primary : colors.textMuted }]}>{t('common.save', 'Save')}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }} keyboardShouldPersistTaps="handled">
        <Field label={t('portal.firstName', 'First name')} colors={colors}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.border }]}
            value={firstName} onChangeText={setFirstName} placeholder={t('portal.firstName', 'First name')}
            placeholderTextColor={colors.textMuted} autoCapitalize="words" autoComplete="given-name"
          />
        </Field>

        <Field label={t('portal.lastName', 'Last name')} colors={colors}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.border }]}
            value={lastName} onChangeText={setLastName} placeholder={t('portal.lastName', 'Last name')}
            placeholderTextColor={colors.textMuted} autoCapitalize="words" autoComplete="family-name"
          />
        </Field>

        <Field label={t('portal.email', 'Email')} colors={colors}>
          <View style={[styles.input, styles.readonly, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.readonlyText, { color: colors.textMuted }]}>{user?.email}</Text>
            <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('portal.emailReadonly', 'Your email is your login and can’t be changed here.')}</Text>
        </Field>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, colors, children }: { label: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, borderBottomWidth: 1 },
  headerBtn: { minWidth: 56, height: 32, justifyContent: 'center' },
  headerTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xl },
  save: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, textAlign: 'right' },
  label: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  readonly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readonlyText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  hint: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 6 },
});
