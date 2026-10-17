import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

/**
 * The older card-style bottom sheet — the Confirm sheet, the Out-of-ring
 * request and the Always-location guide. Its own Modal, a blurred (iOS) or
 * dimmed (Android) backdrop that fades in, the card sliding up on a spring, a
 * grab handle and the home-indicator spacer.
 *
 * The three sheets each carried a full copy of this. It is NOT `BlurSheet`:
 * that one queues for the app's single modal slot and is the presentation new
 * sheets use; these keep their own Modal exactly as before.
 *
 * The caller owns the animation through `useSlideSheet` because its buttons
 * close the sheet first and act after (`sheet.animateClose(onConfirm)`).
 */
export function useSlideSheet(visible: boolean, { dismissKeyboard = false }: { dismissKeyboard?: boolean } = {}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animateClose = useCallback(
    (cb?: () => void) => {
      if (dismissKeyboard) Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      ]).start(() => cb?.());
    },
    [overlayAnim, slideAnim, dismissKeyboard],
  );

  return { slideAnim, overlayAnim, animateClose };
}

export type SlideSheetState = ReturnType<typeof useSlideSheet>;

export function SlideSheet({
  visible,
  sheet,
  onClose,
  avoidKeyboard = false,
  maxHeightFraction,
  children,
}: {
  visible: boolean;
  sheet: SlideSheetState;
  /** The backdrop tap and the Android back button. */
  onClose: () => void;
  /** Wrap in a KeyboardAvoidingView — for a sheet with a text field. */
  avoidKeyboard?: boolean;
  /** Cap the card at this share of the screen; no cap when omitted. */
  maxHeightFraction?: number;
  children: ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const body = (
    <>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: sheet.overlayAnim }]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </BlurView>
        ) : (
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={onClose} />
        )}
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheet.slideAnim }] }]}>
        <View style={[styles.handle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
        <View
          style={[
            styles.content,
            { backgroundColor: colors.card },
            maxHeightFraction !== undefined && { maxHeight: SCREEN_HEIGHT * maxHeightFraction },
          ]}
        >
          {children}
          <View style={{ height: insets.bottom }} />
        </View>
      </Animated.View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {avoidKeyboard ? (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container}>{body}</View>
      )}
    </Modal>
  );
}

/** Title + close cross. With `icon`, the icon leads the title in a row of its own. */
export function SlideSheetHeader({
  title,
  onClose,
  icon,
}: {
  title: string;
  onClose: () => void;
  icon?: { name: keyof typeof Ionicons.glyphMap; color: string };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      {icon ? (
        <View style={styles.titleRow}>
          <Ionicons name={icon.name} size={22} color={icon.color} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        </View>
      ) : (
        <Text style={[styles.title, styles.titleFill, { color: colors.textPrimary }]}>{title}</Text>
      )}
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={24} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

/** Cancel beside a coloured confirm; the confirm shows a spinner while loading. */
export function SlideSheetActions({
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  confirmIcon,
  confirmIconSize,
  confirmColor,
  disabled,
  isLoading,
  style,
}: {
  onCancel: () => void;
  cancelLabel: string;
  onConfirm: () => void;
  confirmLabel: string;
  confirmIcon: React.ComponentProps<typeof Ionicons>['name'];
  confirmIconSize: number;
  confirmColor: string;
  /** The confirm is greyed and inert (the cancel only while loading). */
  disabled: boolean;
  isLoading: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.buttons, style]}>
      <TouchableOpacity
        style={[styles.cancelBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        onPress={onCancel}
        disabled={isLoading}
      >
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{cancelLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.confirmBtn, { backgroundColor: confirmColor }, disabled && styles.disabled]}
        onPress={onConfirm}
        disabled={disabled}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <>
            <Ionicons name={confirmIcon} size={confirmIconSize} color={COLORS.white} />
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: SPACING.sm },
  content: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  titleFill: { flex: 1 },
  buttons: { flexDirection: 'row', gap: SPACING.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  confirmText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  disabled: { opacity: 0.6 },
});
