import { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A Pressable that springs down slightly on press and back on release — one
 * shared, tactile press animation for every interactive card/button (DRY).
 * Single responsibility: press-scale feedback; it forwards all other Pressable
 * props (onPress, disabled, accessibility…) untouched so callers keep full control.
 */
export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** How far to scale down while pressed (0–1). Default 0.96. */
  activeScale?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({ style, activeScale = 0.96, disabled, onPressIn, onPressOut, children, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, friction: 6, tension: 220 });

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => { if (!disabled) spring(activeScale).start(); onPressIn?.(e); }}
      onPressOut={(e) => { spring(1).start(); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
}
