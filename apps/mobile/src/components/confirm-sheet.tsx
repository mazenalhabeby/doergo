import { useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  Platform,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import {
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../lib/constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

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
  buttonBg: string;
}> = {
  danger: { icon: 'warning', buttonBg: '#dc2626' },
  warning: { icon: 'alert-circle', buttonBg: '#d97706' },
  info: { icon: 'information-circle', buttonBg: '#2563eb' },
  success: { icon: 'checkmark-circle', buttonBg: '#16a34a' },
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const config = VARIANT_CONFIG[variant];
  const iconName = icon || config.icon;

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateClose = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [overlayAnim, slideAnim]);

  const handleClose = useCallback(() => {
    animateClose(onClose);
  }, [animateClose, onClose]);

  const handleConfirm = useCallback(() => {
    if (!isLoading) {
      animateClose(onConfirm);
    }
  }, [isLoading, animateClose, onConfirm]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Overlay */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
            </BlurView>
          ) : (
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
              onPress={handleClose}
            />
          )}
        </Animated.View>

        {/* Bottom sheet */}
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={[styles.handle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
          <View style={[styles.content, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Message */}
            {message ? (
              <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            ) : null}

            {/* Buttons */}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                onPress={handleClose}
                disabled={isLoading}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                  {cancelLabel || t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: config.buttonBg }, isLoading && styles.disabled]}
                onPress={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={iconName as any} size={20} color="#fff" />
                    <Text style={styles.confirmText}>{confirmLabel || t('common.confirm')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Safe area spacer */}
            <View style={{ height: insets.bottom }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.sm,
  },
  content: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    flex: 1,
  },
  message: {
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  confirmText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: '#fff',
  },
  disabled: {
    opacity: 0.6,
  },
});
