import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../src/lib/constants';
import { passwordApi } from '../../src/lib/api/auth';

export default function ChangePassword() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await passwordApi.changePassword({ currentPassword: current, newPassword: next });
      Alert.alert(t('portal.done', 'Done'), t('portal.passwordChanged', 'Your password has been changed.'));
      router.back();
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), e instanceof Error ? e.message : t('portal.passwordFailed', 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('portal.changePassword', 'Change password')}</Text>
        <Pressable onPress={save} disabled={!valid || saving} hitSlop={10} style={styles.headerBtn}>
          {saving ? <ActivityIndicator color={COLORS.primary} /> : (
            <Text style={[styles.save, { color: valid ? COLORS.primary : colors.textMuted }]}>{t('common.save', 'Save')}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }} keyboardShouldPersistTaps="handled">
        <PwField label={t('portal.currentPassword', 'Current password')} value={current} onChange={setCurrent} show={show} colors={colors} />
        <PwField label={t('portal.newPassword', 'New password')} value={next} onChange={setNext} show={show} colors={colors}
          error={tooShort ? t('portal.pwTooShort', 'At least 8 characters') : undefined} />
        <PwField label={t('portal.confirmPassword', 'Confirm new password')} value={confirm} onChange={setConfirm} show={show} colors={colors}
          error={mismatch ? t('portal.pwMismatch', 'Passwords don’t match') : undefined} />

        <Pressable style={styles.toggle} onPress={() => setShow((s) => !s)}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textSecondary} />
          <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
            {show ? t('portal.hidePasswords', 'Hide passwords') : t('portal.showPasswords', 'Show passwords')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PwField({ label, value, onChange, show, colors, error }: { label: string; value: string; onChange: (v: string) => void; show: boolean; colors: any; error?: string }) {
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: error ? COLORS.error : colors.border }]}
        value={value} onChangeText={onChange} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
        placeholder="••••••••" placeholderTextColor={colors.textMuted}
      />
      {error ? <Text style={[styles.err, { color: COLORS.error }]}>{error}</Text> : null}
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
  err: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 5 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 4 },
  toggleText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm },
});
