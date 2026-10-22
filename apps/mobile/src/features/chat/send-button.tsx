import { Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { InkIcon } from '../../components/amazen/ink-icon';
import { useIconMotion } from '../../components/amazen/motion';

/** SendButton, moved here unchanged out of chat-rows.tsx. */
/** Send: the theme's jade when there is something to send; the plane flies out and back on a tap. */
export function SendButton({
  onPress,
  disabled,
  label,
  saving,
}: {
  onPress: () => void;
  disabled: boolean;
  label: string;
  saving?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const fly = useIconMotion(saving ? 'pop' : 'fly');
  return (
    <Pressable
      onPress={
        disabled
          ? undefined
          : () => {
              fly.play();
              onPress();
            }
      }
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: c.tile,
        transform: [{ scale: pressed ? 0.9 : 1 }],
      })}
    >
      {disabled ? null : (
        <LinearGradient
          colors={amazen.gradient.mine as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        />
      )}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={fly.style}>
          <InkIcon
            name={saving ? 'check' : 'send'}
            size={20}
            flat
            color={disabled ? c.inkMuted : amazen.gradient.mineInk}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}
