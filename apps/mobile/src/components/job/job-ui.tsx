import React, { type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, LiveDot } from '../amazen';
import type { GlyphProps } from '../glyphs/glyphs';
import { personInitials } from '@hbcfield/shared/client';
export { SectionLabel, StateEyebrow, Initials } from './state-eyebrow';
export {
  ReceiptRow,
  SheetOption,
  RoundButton,
  type Tone,
  Banner,
  Pill,
  Dot,
  JobField,
  ChoiceRow,
  QuietButton,
} from './sheet-option';

/**
 * The job page's small parts — `docs/design/job-flow.html`, `.disc`, `.banner`,
 * `.pill`, `.field`, `.opt`, `.sev`. Everything here reads `useTheme().amazen`;
 * no colour is written down, so light and dark follow the member's setting.
 */

/* ---------------- a receipt line ---------------- */

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
      {/* A plain string is wrapped: raw text in a View is not drawn (and is a console error). */}
      {typeof eyebrow === 'string' ? <AText variant="caption" tone="muted" numberOfLines={1}>{eyebrow}</AText> : eyebrow ?? null}
      {title ? <AText variant="h2" tone="strong" numberOfLines={2} style={{ fontFamily: amazen.font.sansLight }}>{title}</AText> : null}
      {children}
    </View>
  );
  return (
    <BlurSheet visible={visible} onClose={close}>
      <SheetPanel
        onClose={close}
        maxHeightFraction={0.9}
        style={{
          backgroundColor: c.well,
          borderTopLeftRadius: amazen.radius.sheet,
          borderTopRightRadius: amazen.radius.sheet,
          paddingHorizontal: amazen.space(4.5),
          paddingTop: amazen.space(2),
        }}
      >
        {scroll ? (
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            scrollEnabled={scrollEnabled}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : body}
      </SheetPanel>
    </BlurSheet>
  );
}
