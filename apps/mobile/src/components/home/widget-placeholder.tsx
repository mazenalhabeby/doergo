import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText, Well } from '../amazen';

/**
 * A widget that is registered but not built yet.
 *
 * ⚠️ IT SAYS SO. The alternative is a card of realistic-looking fake numbers,
 * and the moment one of those reaches a screenshot or a demo somebody plans
 * around a figure that was invented. An empty box is honest, arranges exactly
 * like a real widget, and cannot be mistaken for data.
 *
 * Each still carries the QUESTION it will answer — from its folder in
 * `docs/design` — because that is the part worth reviewing while the layout is
 * being decided, and because a row labelled only "Crew" tells nobody whether
 * they want it on their home screen.
 */
export function WidgetPlaceholder({
  title,
  question,
  height = 92,
  note = 'not built yet',
}: {
  title: string;
  /** The question this widget answers, from its spec. */
  question: string;
  /** Roughly what it will occupy, so the arrangement is worth arranging. */
  height?: number;
  /**
   * The small grey words on the right.
   *
   * ⚠️ IT DEFAULTS TO THE TRUTH ABOUT AN UNBUILT WIDGET, AND THAT IS NOT THE
   * ONLY REASON THIS COMPONENT GETS USED. The arrangement screen also stands
   * in for a widget that IS built and simply has nothing to report — telling
   * somebody their working widget is "not built yet" is a worse lie than the
   * fake numbers this component exists to avoid.
   */
  note?: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Well style={{ padding: amazen.space(4), minHeight: height, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: amazen.radius.full,
            borderWidth: 1.5,
            borderColor: c.inkMuted,
          }}
        />
        <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium }}>
          {title}
        </AText>
        <View style={{ flex: 1 }} />
        <AText variant="caption" tone="muted">{note}</AText>
      </View>
      <AText variant="caption" tone="muted" style={{ marginTop: 6 }}>
        {question}
      </AText>
    </Well>
  );
}
