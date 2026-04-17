import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { SheetHeader } from '../../../src/components';
import { useToast } from '../../../src/contexts/toast-context';
import { passwordApi } from '../../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../../src/lib/constants';

export default function AccountScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      toast.warning(t('common.required'), t('profile.account.currentPasswordRequired'));
      return;
    }
    if (newPassword.length < 8) {
      toast.warning(t('common.error'), t('profile.account.newPasswordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning(t('common.error'), t('profile.account.passwordsMismatch'));
      return;
    }

    try {
      setIsSubmitting(true);
      await passwordApi.changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('common.success'), t('profile.account.passwordChanged'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('profile.account.failedToChange'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SheetHeader />
        {/* Account Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('profile.account.accountInfo')}</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={18} color={colors.textMuted} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{t('profile.account.nameLabel')}</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.firstName} {user?.lastName}</Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{t('profile.account.emailLabel')}</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.email}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Change Password */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('profile.account.changePassword')}</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.account.currentPasswordLabel')}</Text>
              <View style={[styles.passwordRow, { borderColor: colors.inputBorder, backgroundColor: colors.input }]}>
                <TextInput
                  style={[styles.passwordInput, { color: colors.textPrimary }]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrentPw}
                  placeholder={t('profile.account.currentPasswordPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowCurrentPw(!showCurrentPw)}>
                  <Ionicons
                    name={showCurrentPw ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.account.newPasswordLabel')}</Text>
              <View style={[styles.passwordRow, { borderColor: colors.inputBorder, backgroundColor: colors.input }]}>
                <TextInput
                  style={[styles.passwordInput, { color: colors.textPrimary }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPw}
                  placeholder={t('profile.account.newPasswordPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowNewPw(!showNewPw)}>
                  <Ionicons
                    name={showNewPw ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.account.confirmPasswordLabel')}</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.input, color: colors.textPrimary }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder={t('profile.account.confirmPasswordPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
              onPress={handleChangePassword}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.submitButtonText}>{t('profile.account.submitButton')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: SPACING.xxxl,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase' as const,
    marginBottom: SPACING.sm,
  },
  card: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: FONT_SIZE.sm,
  },
  infoValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.base,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
