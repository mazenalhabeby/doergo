import type { ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../lib/constants';

/**
 * A client's form page in the portal — Edit profile, Change password: back,
 * a title, Save on the right (a spinner while saving), and the fields in a
 * keyboard-aware scroll. Both pages wrote the frame and its styles out in full.
 */
export function PortalFormScreen({
  title,
  onSave,
  canSave,
  saving,
  children,
}: {
  title: string;
  onSave: () => void;
  /** Save is offered (coloured and pressable). */
  canSave: boolean;
  saving: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[portalFormStyles.header, { paddingTop: insets.top + SPACING.sm, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={portalFormStyles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[portalFormStyles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Pressable onPress={onSave} disabled={!canSave || saving} hitSlop={10} style={portalFormStyles.headerBtn}>
          {saving ? <ActivityIndicator color={COLORS.primary} /> : (
            <Text style={[portalFormStyles.save, { color: canSave ? COLORS.primary : colors.textMuted }]}>{t('common.save', 'Save')}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A labelled field on a portal form. */
export function PortalField({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={[portalFormStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

export const portalFormStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, borderBottomWidth: 1 },
  headerBtn: { minWidth: 56, height: 32, justifyContent: 'center' },
  headerTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xl },
  save: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, textAlign: 'right' },
  label: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
});
