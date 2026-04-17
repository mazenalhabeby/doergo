import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../lib/constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface ClockOutSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  isLoading?: boolean;
}

export function ClockOutSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  notesLabel,
  notesPlaceholder,
  isLoading = false,
}: ClockOutSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const canConfirm = notes.trim().length > 0;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
      },
    );
    return () => sub.remove();
  }, [visible]);

  const animateClose = useCallback((cb?: () => void) => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [overlayAnim, slideAnim]);

  const handleClose = useCallback(() => {
    animateClose(() => {
      setNotes('');
      onClose();
    });
  }, [animateClose, onClose]);

  const handleConfirm = useCallback(() => {
    if (!isLoading && canConfirm) {
      const text = notes.trim();
      animateClose(() => {
        setNotes('');
        onConfirm(text);
      });
    }
  }, [isLoading, canConfirm, notes, animateClose, onConfirm]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
            <ScrollView
              ref={scrollRef}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Subtitle */}
              {message ? (
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{message}</Text>
              ) : null}

              {/* Notes label */}
              <Text style={[styles.notesLabel, { color: colors.textSecondary }]}>{notesLabel}</Text>

              {/* Notes input */}
              <TextInput
                style={[
                  styles.notesInput,
                  {
                    backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc',
                    borderColor: canConfirm ? '#d97706' : colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder={notesPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
                onFocus={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
                }}
              />

              <Text style={[styles.charCount, { color: colors.textMuted }]}>
                {notes.length}/500
              </Text>

              {/* Buttons */}
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  onPress={handleClose}
                  disabled={isLoading}
                >
                  <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{cancelLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmBtn, (!canConfirm || isLoading) && styles.disabled]}
                  onPress={handleConfirm}
                  disabled={!canConfirm || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
                      <Text style={styles.confirmText}>{confirmLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Safe area spacer */}
            <View style={{ height: insets.bottom }} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
    maxHeight: SCREEN_HEIGHT * 0.85,
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
  },
  subtitle: {
    fontSize: FONT_SIZE.base,
    marginBottom: SPACING.lg,
  },
  notesLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  notesInput: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: SPACING.md,
    fontSize: FONT_SIZE.base,
    height: 120,
    lineHeight: 22,
  },
  charCount: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'right',
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING.md,
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
    backgroundColor: '#d97706',
  },
  confirmText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  disabled: {
    opacity: 0.6,
  },
});
