import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { AText, type Tone } from './text';
import { useTheme } from '../../contexts/theme-context';

/**
 * The hero, set like an amount.
 *
 * `3 h 12 m`, integer at `display` and the unit at `decimal` — the same rule
 * the system uses for money, because it is the same problem: a big number with
 * a small qualifier after it. `3h 12m` at one size is a string, not a figure.
 *
 * ⚠️ ONE PER SCREEN.
 */
export interface HeroPart {
  value: string;
  /** `h`, `m`, `of 8h` — anything that qualifies rather than counts. */
  unit?: string;
}

export function Hero({
  parts,
  tone = 'strong',
  unitTone,
  style,
  small = false,
}: {
  parts: HeroPart[];
  tone?: Tone;
  unitTone?: Tone;
  style?: ViewStyle;
  /** `displaySm` — the week total, the batch count. */
  small?: boolean;
}) {
  const { amazen } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline' }, style]}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          <AText
            variant={small ? 'displaySm' : 'display'}
            tone={tone}
            numeric
            style={i > 0 ? { marginLeft: amazen.space(2) } : undefined}
          >
            {p.value}
          </AText>
          {p.unit ? (
            <AText
              variant="decimal"
              tone={unitTone ?? (tone === 'strong' ? 'ink' : tone)}
              style={{ marginLeft: amazen.space(1) }}
            >
              {p.unit}
            </AText>
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}
