import React, { type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, LiveDot } from '../amazen';
import type { GlyphProps } from '../glyphs/glyphs';

/**
 * The job page's small parts — `docs/design/job-flow.html`, `.disc`, `.banner`,
 * `.pill`, `.field`, `.opt`, `.sev`. Everything here reads `useTheme().amazen`;
 * no colour is written down, so light and dark follow the member's setting.
 */

/* ---------------- the one sheet ---------------- */

/**
 * EVERY POPUP ON THE JOB PAGE IS THIS — `BlurSheet` + `SheetPanel`.
 *
 * ⚠️ The page used four raw `<Modal>`s, which skip the one-slot queue in
 * `blur-sheet.tsx`: that is how a second popup is refused by UIKit and a button
 * goes dead with nothing in the log. One wrapper, so the next sheet written
 * here cannot be written the other way.
 */
export function JobSheet({
  visible,
  onClose,
  title,
  eyebrow,
  busy = false,
  scroll = true,
  scrollEnabled = true,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** A line above the title — where the thing is and what state it is in (a live dot + a workspace). */
  eyebrow?: ReactNode;
  /** Work in flight — the sheet cannot be flicked away mid-send. */
  busy?: boolean;
  /** Off for a sheet that must never scroll. */
  scroll?: boolean;
  /** Held off while a finger is on a signature pad — a scroll that starts mid-stroke cuts the stroke in half. */
  scrollEnabled?: boolean;
  children: ReactNode;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const close = busy ? () => undefined : onClose;
  const body = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(2) }}>
      {eyebrow ?? null}
      {title ? <AText variant="h2" tone="strong" numberOfLines={2} style={{ fontFamily: amazen.font.sansLight }}>{title}</AText> : null}
      {children}
    </View>
  );
  return (
    <BlurSheet visible={visible} onClose={close}>
      <SheetPanel
        onClose={close}
        maxHeightFraction={0.9}
        style={{ backgroundColor: c.well, borderTopLeftRadius: amazen.radius.sheet, borderTopRightRadius: amazen.radius.sheet, paddingHorizontal: amazen.space(4.5), paddingTop: amazen.space(2) }}
      >
        {scroll ? (
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : body}
      </SheetPanel>
    </BlurSheet>
  );
}

/** A choice in a sheet — `.opt`. Critical ones are red ink on the same tile, never a red fill. */
export function SheetOption({
  label,
  hint,
  tone = 'strong',
  Glyph,
  onPress,
  disabled,
}: {
  label: string;
  hint?: string;
  tone?: 'strong' | 'critical' | 'accent';
  Glyph?: React.ComponentType<GlyphProps>;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const ink = tone === 'critical' ? c.critical : tone === 'accent' ? c.accent : c.inkStrong;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
        backgroundColor: c.tile, borderRadius: 16,
        paddingVertical: amazen.space(3.25), paddingHorizontal: amazen.space(3.5),
        minHeight: amazen.layout.tapMin + 4,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {Glyph ? <Glyph size={20} color={ink} contrast={c.well} /> : null}
      <AText variant="body" numberOfLines={2} style={{ color: ink, flexShrink: 1 }}>{label}</AText>
      {hint ? (
        <AText variant="caption" tone="muted" numberOfLines={2} style={{ marginLeft: 'auto', flexShrink: 1, textAlign: 'right', maxWidth: '55%' }}>{hint}</AText>
      ) : null}
    </Pressable>
  );
}

/* ---------------- the dock's discs ---------------- */

/**
 * A 46pt round button — `.disc` in the mockup's dock. Not the 58pt labelled
 * `Disc`: the dock is one row beside a full-width primary, and its label is
 * spoken (`accessibilityLabel`) because the mark sits next to words that say it.
 */
export function RoundButton({
  Glyph,
  label,
  tone = 'plain',
  onPress,
  disabled,
  size = 46,
}: {
  Glyph: React.ComponentType<GlyphProps>;
  label: string;
  tone?: 'plain' | 'jade';
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const jade = tone === 'jade';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: amazen.radius.full,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: jade ? c.accentTint : c.tile,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      <Glyph size={20} color={jade ? c.accent : c.inkStrong} contrast={c.well} />
    </Pressable>
  );
}

/* ---------------- words on a tint ---------------- */

export type Tone = 'accent' | 'warn' | 'critical' | 'neutral';

function tintOf(c: ReturnType<typeof useTheme>['amazen']['color'], tone: Tone) {
  switch (tone) {
    case 'accent': return { bg: c.accentTint, fg: c.accent };
    case 'warn': return { bg: c.warnTint, fg: c.warn };
    case 'critical': return { bg: c.criticalTint, fg: c.critical };
    default: return { bg: c.tile, fg: c.ink };
  }
}

/** `.banner` — one sentence on a tint, with at most one action at its end. */
export function Banner({
  tone,
  text,
  action,
  style,
}: {
  tone: Tone;
  text: string;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  style?: StyleProp<ViewStyle>;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { bg, fg } = tintOf(c, tone);
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), borderRadius: 16, paddingVertical: amazen.space(2.5), paddingHorizontal: amazen.space(3), backgroundColor: bg }, style]}>
      <AText variant="caption" style={{ color: fg, flex: 1, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>{text}</AText>
      {action ? (
        <Pressable
          onPress={action.disabled ? undefined : action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={6}
          style={({ pressed }) => ({
            borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.5),
            backgroundColor: c.accentSolid, maxWidth: '50%',
            opacity: action.disabled ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <AText variant="caption" tone="accentInk" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: amazen.font.sansMedium }}>{action.label}</AText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** `.pill` — mono, uppercase, tracked. A fact, never a control. */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { amazen } = useTheme();
  const { bg, fg } = tintOf(amazen.color, tone);
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: bg, flexShrink: 0 }}>
      <AText numberOfLines={1} style={{ color: fg, fontFamily: amazen.font.mono, fontSize: 10, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</AText>
    </View>
  );
}

/** A dot — jade, or the tone of the state it marks. */
export function Dot({ tone = 'accent', size = 8 }: { tone?: 'accent' | 'warn' | 'critical' | 'dim'; size?: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const bg = tone === 'warn' ? c.warn : tone === 'critical' ? c.critical : tone === 'dim' ? c.inkMuted : c.accent;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }} />;
}

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
            <AText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: on ? c.inkStrong : c.ink, fontSize: 13 }}>{o.label}</AText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A quiet full-width button — `.ghost`. */
export function QuietButton({ label, tone = 'strong', onPress, disabled, dashed }: { label: string; tone?: 'strong' | 'critical' | 'accent'; onPress: () => void; disabled?: boolean; dashed?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const ink = tone === 'critical' ? c.critical : tone === 'accent' ? c.accent : c.inkStrong;
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

/** The mockup's mono eyebrow — `.ey`. */
export function SectionLabel({ children, tone = 'muted', style }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' | 'critical'; style?: StyleProp<ViewStyle> }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = tone === 'accent' ? c.accent : tone === 'warn' ? c.warn : tone === 'critical' ? c.critical : c.inkMuted;
  return (
    <View style={style}>
      <AText numberOfLines={1} style={{ color, fontFamily: amazen.font.mono, fontSize: 10.5, lineHeight: 14, letterSpacing: 2, textTransform: 'uppercase' }}>{children}</AText>
    </View>
  );
}

/**
 * A dot and a mono line — "● ON THE CLOCK · HBC OFFICE". What the thing is doing
 * and where, above a sheet's title. The dot breathes only while `live`.
 */
export function StateEyebrow({ label, tone = 'muted', live = false }: { label: string; tone?: 'muted' | 'accent' | 'warn' | 'critical'; live?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = tone === 'accent' ? c.accent : tone === 'warn' ? c.warn : tone === 'critical' ? c.critical : c.lineField;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
      <LiveDot color={color} live={live} />
      <SectionLabel tone={tone} style={{ flexShrink: 1 }}>{label}</SectionLabel>
    </View>
  );
}

/** Initials in a jade circle — `.av`. */
export function Initials({ first, last, size = 30 }: { first?: string | null; last?: string | null; size?: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const text = `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '·';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
      <AText variant="caption" tone="accent" style={{ fontSize: 11, fontFamily: amazen.font.sansMedium }}>{text}</AText>
    </View>
  );
}
