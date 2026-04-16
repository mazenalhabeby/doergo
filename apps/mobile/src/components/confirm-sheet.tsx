import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../lib/constants';

export type ConfirmSheetVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmSheetVariant;
  icon?: string;
  isLoading?: boolean;
}

const VARIANT_CONFIG: Record<ConfirmSheetVariant, {
  icon: string;
  iconColor: string;
  iconBg: string;
  iconBgDark: string;
  buttonBg: string;
  buttonBgPressed: string;
}> = {
  danger: {
    icon: 'warning',
    iconColor: '#dc2626',
    iconBg: '#fef2f2',
    iconBgDark: 'rgba(220,38,38,0.15)',
    buttonBg: '#dc2626',
    buttonBgPressed: '#b91c1c',
  },
  warning: {
    icon: 'alert-circle',
    iconColor: '#d97706',
    iconBg: '#fffbeb',
    iconBgDark: 'rgba(217,119,6,0.15)',
    buttonBg: '#d97706',
    buttonBgPressed: '#b45309',
  },
  info: {
    icon: 'information-circle',
    iconColor: '#2563eb',
    iconBg: '#eff6ff',
    iconBgDark: 'rgba(37,99,235,0.15)',
    buttonBg: '#2563eb',
    buttonBgPressed: '#1d4ed8',
  },
  success: {
    icon: 'checkmark-circle',
    iconColor: '#16a34a',
    iconBg: '#f0fdf4',
    iconBgDark: 'rgba(22,163,74,0.15)',
    buttonBg: '#16a34a',
    buttonBgPressed: '#15803d',
  },
};

export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  icon,
  isLoading = false,
}: ConfirmSheetProps) {
  const { colors, isDark } = useTheme();
  const config = VARIANT_CONFIG[variant];
  const iconName = icon || config.icon;

  const handleConfirm = useCallback(() => {
    if (!isLoading) onConfirm();
  }, [isLoading, onConfirm]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: isDark ? config.iconBgDark : config.iconBg }]}>
            <Ionicons name={iconName as any} size={32} color={config.iconColor} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

          {/* Message */}
          {message && (
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          )}

          {/* Buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9' }]}
              onPress={onClose}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                {cancelLabel || 'Cancel'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: config.buttonBg }, isLoading && styles.disabled]}
              onPress={handleConfirm}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel || 'Confirm'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: RADIUS.lg + 4,
    padding: SPACING.xxl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xl + 2,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
    marginTop: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#fff',
  },
  disabled: {
    opacity: 0.6,
  },
});
