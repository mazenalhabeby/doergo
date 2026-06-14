import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Pressable,
  Dimensions,
} from 'react-native';
import { useTheme } from '../../../contexts/theme-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Sheet height as a fraction of screen height (0–1). */
  heightRatio?: number;
  children: React.ReactNode;
}

const SCREEN_H = Dimensions.get('window').height;

/**
 * Reusable animated bottom sheet: backdrop fade + spring slide-up, tap-outside
 * to dismiss, drag grip. Encapsulates the Modal/Animated boilerplate so feature
 * sheets (activity, assign-member) only describe their content (DRY / SRP).
 */
export function BottomSheet({ visible, onClose, heightRatio = 0.72, children }: Props) {
  const { colors } = useTheme();
  const height = Math.round(SCREEN_H * heightRatio);
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(height);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }),
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, height, translateY, backdrop]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: height, duration: 220, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { height, backgroundColor: colors.surface, transform: [{ translateY }] }]}
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
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
