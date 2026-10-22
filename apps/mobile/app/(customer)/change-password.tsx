import { useState } from 'react';
import { Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/theme-context';
import { COLORS, FONT_SIZE, type ThemeColors } from '@/lib/constants';
import { passwordApi } from '@/lib/api/auth';
import { PortalField, PortalFormScreen, portalFormStyles } from '@/features/customer/portal-form';

export default function ChangePassword() {
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
      Alert.alert(
        t('common.error', 'Error'),
        e instanceof Error ? e.message : t('portal.passwordFailed', 'Could not change your password.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalFormScreen
      title={t('portal.changePassword', 'Change password')}
      onSave={save}
      canSave={valid}
      saving={saving}
    >
      <PwField
        label={t('portal.currentPassword', 'Current password')}
        value={current}
        onChange={setCurrent}
        show={show}
        colors={colors}
      />
      <PwField
        label={t('portal.newPassword', 'New password')}
        value={next}
        onChange={setNext}
        show={show}
        colors={colors}
        error={tooShort ? t('portal.pwTooShort', 'At least 8 characters') : undefined}
      />
      <PwField
        label={t('portal.confirmPassword', 'Confirm new password')}
        value={confirm}
        onChange={setConfirm}
        show={show}
        colors={colors}
        error={mismatch ? t('portal.pwMismatch', 'Passwords don’t match') : undefined}
      />

      <Pressable style={styles.toggle} onPress={() => setShow((s) => !s)}>
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textSecondary} />
        <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
          {show ? t('portal.hidePasswords', 'Hide passwords') : t('portal.showPasswords', 'Show passwords')}
        </Text>
      </Pressable>
    </PortalFormScreen>
  );
}

function PwField({
  label,
  value,
  onChange,
  show,
  colors,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  colors: ThemeColors;
  error?: string;
}) {
  return (
    <PortalField label={label}>
      <TextInput
        style={[
          portalFormStyles.input,
          {
            color: colors.textPrimary,
            backgroundColor: colors.card,
            borderColor: error ? COLORS.error : colors.border,
          },
        ]}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="••••••••"
        placeholderTextColor={colors.textMuted}
      />
      {error ? <Text style={[styles.err, { color: COLORS.error }]}>{error}</Text> : null}
    </PortalField>
  );
}

const styles = StyleSheet.create({
  err: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 5 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 4 },
  toggleText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm },
});
