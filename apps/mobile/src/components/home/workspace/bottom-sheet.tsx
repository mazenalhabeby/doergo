import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Pressable,
  Platform,
  Dimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../../contexts/theme-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Sheet height as a fraction of screen height (0–1). Used as a fixed height,
   * or as the MAX height when `dynamicHeight` is set. */
  heightRatio?: number;
  /** When true the sheet hugs its content height (capped at heightRatio of the
   * screen) instead of using a fixed height — avoids empty space under short
   * content. */
  dynamicHeight?: boolean;
  children: React.ReactNode;
}

const SCREEN_H = Dimensions.get('window').height;

/**
 * Reusable animated bottom sheet: backdrop fade + spring slide-up, tap-outside
 * to dismiss, drag grip. Supports a fixed height (default) or a content-hugging
 * dynamic height (`dynamicHeight`). Encapsulates the Modal/Animated boilerplate
 * so feature sheets only describe their content (DRY / SRP).
 */
export function BottomSheet({
  visible,
  onClose,
  heightRatio = 0.72,
  dynamicHeight = false,
  children,
}: Props) {
  const { colors } = useTheme();
  const fixedHeight = Math.round(SCREEN_H * heightRatio);
  const maxHeight = Math.round(SCREEN_H * (dynamicHeight ? Math.max(heightRatio, 0.9) : heightRatio));

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const measuredRef = useRef(SCREEN_H);
  const openedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      openedRef.current = false;
      translateY.setValue(SCREEN_H); // start off-screen
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (!dynamicHeight) {
        // Fixed height is known up front — animate immediately.
        openedRef.current = true;
        translateY.setValue(fixedHeight);
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
      }
      // Dynamic height: the open spring is kicked off in onLayout once the real
      // content height is known (so it travels exactly the sheet's height).
    }
  }, [visible, dynamicHeight, fixedHeight, translateY, backdrop]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: measuredRef.current, duration: 220, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    measuredRef.current = h;
    if (dynamicHeight && visible && !openedRef.current) {
      openedRef.current = true;
      translateY.setValue(h); // position just off-screen, then spring up exactly h
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
            </BlurView>
          ) : (
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={handleClose} />
          )}
        </Animated.View>

        <Animated.View
          onLayout={onSheetLayout}
          style={[
            styles.sheet,
            dynamicHeight ? { maxHeight } : { height: fixedHeight },
            { backgroundColor: colors.surface, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grip} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 16,
  },
  grip: {
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(140,140,150,0.5)',
    alignSelf: 'center',
    marginVertical: 10,
  },
});
