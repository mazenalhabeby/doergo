/** JobField, ChoiceRow and QuietButton from sheet-option.tsx — moved here unchanged (2026-10-17 line-length split). */
import { toneColor } from '../../theme/tone-color';
import React from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';

/* ---------------- fields ---------------- */

/** `.field` — a sunken input with a hairline that turns jade on focus. */
export function JobField({ multiline, style, ...rest }: TextInputProps) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const [focus, setFocus] = React.useState(false);
  return (
    <TextInput
      placeholderTextColor={c.inkMuted}
      {...rest}
      multiline={multiline}
      onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
      style={[
        {
          backgroundColor: c.sunken,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: focus ? c.accent : c.lineWell,
          paddingHorizontal: amazen.space(3.5),
          paddingVertical: amazen.space(3),
          color: c.inkStrong,
          fontFamily: amazen.font.sans,
          fontSize: 14,
          minHeight: multiline ? 84 : amazen.layout.tapMin,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        style,
      ]}
    />
  );
}

/** `.sev` — four equal choices in a row. The selected one is an outline, not a colour. */
export function ChoiceRow<K extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              flex: 1, alignItems: 'center', justifyContent: 'center',
              minHeight: amazen.layout.tapMin, borderRadius: amazen.radius.full,
              backgroundColor: on ? 'transparent' : c.tile,
              borderWidth: 2, borderColor: on ? c.inkStrong : 'transparent',
              paddingHorizontal: 2,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <AText
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ color: on ? c.inkStrong : c.ink, fontSize: 13 }}
            >
              {o.label}
            </AText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A quiet full-width button — `.ghost`. */
export function QuietButton({
  label,
  tone = 'strong',
  onPress,
  disabled,
  dashed,
}: {
  label: string;
  tone?: 'strong' | 'critical' | 'accent';
  onPress: () => void;
  disabled?: boolean;
  dashed?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const ink = toneColor(c, tone, c.inkStrong);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        minHeight: amazen.layout.tapMin + 2, borderRadius: amazen.radius.full,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: amazen.space(4),
        backgroundColor: dashed ? 'transparent' : c.tile,
        borderWidth: dashed ? 1.5 : 0, borderStyle: dashed ? 'dashed' : 'solid', borderColor: c.lineField,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      <AText variant="body" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: ink }}>{label}</AText>
    </Pressable>
  );
}
