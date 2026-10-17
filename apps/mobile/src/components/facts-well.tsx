import React from 'react';
import { View } from 'react-native';
import { AText } from './amazen';
import type { useTheme } from '../contexts/theme-context';

type Amazen = ReturnType<typeof useTheme>['amazen'];
/** A fact: label, value, and how the value reads (none = plain). */
export type Fact = [label: string, value: string, tone?: 'bad' | 'warn' | string | null];

/**
 * Label → value lines in a sunken well, ruled between rows (an approval's facts, a client
 * request's facts). `lines` caps how far a long value wraps.
 */
export function FactsWell({ amazen, facts, lines }: { amazen: Amazen; facts: Fact[]; lines: number }) {
  const c = amazen.color;
  return (
    <View
      style={{
        backgroundColor: c.well,
        borderRadius: amazen.radius.panel,
        paddingHorizontal: amazen.space(3.5),
        paddingVertical: amazen.space(1.5),
      }}
    >
      {facts.map(([k, v, tone], i) => (
        <View
          key={k}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: amazen.space(3),
            paddingVertical: amazen.space(2.25),
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: c.lineWell,
          }}
        >
          <AText variant="caption" style={{ color: c.inkMuted, fontSize: 13 }}>
            {k}
          </AText>
          <AText
            variant="body"
            tone={tone === 'bad' ? 'critical' : tone === 'warn' ? 'warn' : 'strong'}
            numberOfLines={lines}
            style={{ fontSize: 13.5, flexShrink: 1, textAlign: 'right' }}
          >
            {v}
          </AText>
        </View>
      ))}
    </View>
  );
}
