import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText, LiveDot, Banner, RoundButton } from '@/components/amazen';
import { MoreGlyph, NavigateGlyph } from '@/components/glyphs';
import type { GlyphProps } from '@/components/glyphs/glyphs';
import { TourTarget } from '../tour';
import { EditGlyph } from './job-glyphs';
import { type Tone } from './job-ui';

export interface DockPrimary {
  label: string;
  /** A few characters of fact after the label — never a name or a title. */
  detail?: string;
  Glyph?: React.ComponentType<GlyphProps>;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * The bottom of the job — `.dock`. ONE primary button, always the next step
 * in the job's own workflow; a jade Navigate disc while the job is travel;
 * ⋯ for everything else. Decline and Report an issue live in ⋯, so nobody
 * declines by accident.
 *
 * Overseeing a job that is not yours: Assign/Reassign, Edit, ⋯.
 * A finished or called-off job: one line instead of buttons.
 */
export function JobDock({
  timer,
  closedText,
  primary,
  navigate,
  onMore,
  onEdit,
  bottomInset,
  notice = null,
}: {
  /** "1:12 on this job · tracking your route" — and whether the route is live. */
  timer: { text: string; live: boolean; retry?: () => void } | null;
  closedText: string | null;
  primary: DockPrimary | null;
  navigate: (() => void) | null;
  onMore: (() => void) | null;
  onEdit: (() => void) | null;
  bottomInset: number;
  /** Said in the dock itself — the island is drawn under this modal page. */
  notice?: { tone: Tone; text: string; action?: { label: string; onPress: () => void } } | null;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  if (!timer && !closedText && !primary && !onMore) return null;
  return (
    <View
      style={{ paddingTop: amazen.space(3), paddingHorizontal: amazen.space(4), paddingBottom: Math.max(bottomInset, amazen.space(4)), gap: amazen.space(2), backgroundColor: c.canvas }}
    >
      {timer ? (
        <TourTarget
          name="taskdetail-timer"
          style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5), alignSelf: 'flex-start' }}>
          <LiveDot color={c.accent} live={timer.live} size={7} />
          <AText variant="caption" tone="ink" numeric numberOfLines={1} style={{ flexShrink: 1 }}>{timer.text}</AText>
          {timer.retry ? (
            <Pressable onPress={timer.retry} accessibilityRole="button" hitSlop={8}>
              <AText variant="caption" tone="accent">{t('common.retry')}</AText>
            </Pressable>
          ) : null}
        </TourTarget>
      ) : null}
      {notice ? <Banner tone={notice.tone} text={notice.text} action={notice.action} /> : null}
      {closedText ? (
        <Banner tone="accent" text={closedText} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          {primary ? (
            <TourTarget name="taskdetail-actions" style={{ flex: 1, flexDirection: 'row' }}>
              <JadeButton {...primary} />
            </TourTarget>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {onEdit ? <RoundButton Glyph={EditGlyph} label={t('job.dock.edit')} onPress={onEdit} /> : null}
          {navigate ? (
            <TourTarget name="taskdetail-navigate">
              <RoundButton Glyph={NavigateGlyph} label={t('job.dock.navigate')} tone="jade" onPress={navigate} />
            </TourTarget>
          ) : null}
          {onMore ? (
            <TourTarget name="taskdetail-more">
              <RoundButton Glyph={MoreGlyph} label={t('job.dock.more')} onPress={onMore} />
            </TourTarget>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** The lit jade pill with the step's mark in it — `.primary`. Also the Jobs tab's Next up button. */
export function JadeButton({ label, detail, Glyph, onPress, disabled, loading }: DockPrimary) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => ({ flex: 1, borderRadius: amazen.radius.full, overflow: 'hidden', opacity: off ? 0.5 : pressed ? 0.88 : 1 })}
    >
      <LinearGradient
        colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
        style={{
          minHeight: 46,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: amazen.space(2),
          paddingHorizontal: amazen.space(4.5),
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={c.accentInk} />
        ) : Glyph ? (
          <Glyph size={20} color={c.accentInk} contrast={c.accentSolid} />
        ) : null}
        <AText
          variant="body"
          tone="accentInk"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ flexShrink: 1, fontFamily: amazen.font.sansMedium }}
        >
          {label}
        </AText>
        {detail ? <AText variant="caption" tone="accentInk" numeric numberOfLines={1} style={{ opacity: 0.75 }}>{detail}</AText> : null}
      </LinearGradient>
    </Pressable>
  );
}
