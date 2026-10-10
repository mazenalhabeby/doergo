import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { FONT_SIZE } from '../../src/lib/constants';
import { userApi } from '../../src/lib/api/auth';
import { PortalField, PortalFormScreen, portalFormStyles } from '../../src/components/customer/portal-form';

export default function EditProfile() {
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
    <PortalFormScreen title={t('portal.editProfile', 'Edit profile')} onSave={save} canSave={valid && dirty} saving={saving}>
      <PortalField label={t('portal.firstName', 'First name')}>
        <TextInput
          style={[portalFormStyles.input, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.border }]}
          value={firstName} onChangeText={setFirstName} placeholder={t('portal.firstName', 'First name')}
          placeholderTextColor={colors.textMuted} autoCapitalize="words" autoComplete="given-name"
        />
      </PortalField>

      <PortalField label={t('portal.lastName', 'Last name')}>
        <TextInput
          style={[portalFormStyles.input, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.border }]}
          value={lastName} onChangeText={setLastName} placeholder={t('portal.lastName', 'Last name')}
          placeholderTextColor={colors.textMuted} autoCapitalize="words" autoComplete="family-name"
        />
      </PortalField>

      <PortalField label={t('portal.email', 'Email')}>
        <View style={[portalFormStyles.input, styles.readonly, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.readonlyText, { color: colors.textMuted }]}>{user?.email}</Text>
          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('portal.emailReadonly', 'Your email is your login and can’t be changed here.')}</Text>
      </PortalField>
    </PortalFormScreen>
  );
}

const styles = StyleSheet.create({
  readonly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readonlyText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  hint: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 6 },
});
