import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * One bottom-sheet presentation for the whole app (DRY): a blurred + dimmed
 * backdrop that FADES in, while the sheet SLIDES up — matching the break sheet.
 * Single responsibility: modal presentation + backdrop + open/close animation.
 * Callers just provide their own sheet content (bg, handle, padding) as children;
 * this owns the Modal, the tap-to-dismiss backdrop, and the animation.
 */
export function BlurSheet({
  visible,
  onClose,
  children,
  avoidKeyboard = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  avoidKeyboard?: boolean;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const overlay = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlay, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slide, { toValue: height, duration: 250, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const Wrap: any = avoidKeyboard ? KeyboardAvoidingView : Animated.View;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Wrap style={styles.container} behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlay }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </BlurView>
          ) : (
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={onClose} />
          )}
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: slide }] }}>{children}</Animated.View>
      </Wrap>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
});
