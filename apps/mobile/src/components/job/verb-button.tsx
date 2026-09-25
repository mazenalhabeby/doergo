import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { FlowStatus } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { AcceptGlyph, OnMyWayGlyph, ArrivedGlyph, StartWorkGlyph, FinishGlyph } from '../glyphs/work-glyphs';
import type { GlyphProps } from '../glyphs/glyphs';
import { verbKind, type VerbKind } from './job-flow';

/** The mark follows what the step MEANS — never its name. */
const MARK: Record<VerbKind, React.ComponentType<GlyphProps>> = {
  drive: OnMyWayGlyph,
  arrive: ArrivedGlyph,
  start: StartWorkGlyph,
  finish: FinishGlyph,
  next: AcceptGlyph,
};

/** "Start driving", "I've arrived", "Start work", "Finish the job" — or the next step's own name. */
export function verbLabel(t: (k: string, o?: Record<string, unknown>) => string, current: FlowStatus, to: FlowStatus): string {
  const kind = verbKind(current, to);
  if (kind === 'next') return t('job.verb.next', { label: to.label, defaultValue: to.label });
  return t(`job.verb.${kind}`, { defaultValue: { drive: 'Start driving', arrive: "I've arrived", start: 'Start work', finish: 'Finish the job' }[kind] });
}

/**
 * THE ONE FILLED BUTTON on a job — the next step, and nothing else is filled.
 *
 * ⚠️ The lift sits on a wrapper: the pill clips its gradient with
 * `overflow: hidden`, which on iOS also clips its own shadow (09.png).
 */
export function VerbButton({ current, to, busy, onPress, flex = true }: {
  current: FlowStatus;
  to: FlowStatus;
  busy?: boolean;
  onPress: () => void;
  flex?: boolean;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const Mark = MARK[verbKind(current, to)];
  const label = verbLabel(t, current, to);
  return (
    <View
      style={{
        flex: flex ? 1 : undefined, borderRadius: amazen.radius.full, backgroundColor: c.accentSolid,
        shadowColor: c.accentSolid, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
      }}
    >
      <Pressable
        onPress={busy ? undefined : onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: !!busy }}
        style={({ pressed }) => ({ borderRadius: amazen.radius.full, overflow: 'hidden', opacity: busy ? 0.6 : pressed ? 0.88 : 1 })}
      >
        <LinearGradient
          colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
          style={{ minHeight: amazen.layout.tapMin + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: amazen.space(2), paddingHorizontal: amazen.space(4) }}
        >
          <Mark size={17} color={c.accentInk} contrast={amazen.gradient.primary[1]} />
          <AText variant="body" tone="accentInk" style={{ fontFamily: amazen.type.h3.fontFamily }} numberOfLines={1}>{label}</AText>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
