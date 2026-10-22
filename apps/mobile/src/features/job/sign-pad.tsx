import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { NativeSignaturePad, type NativeSignaturePadHandle } from '@/components/signature-pad-native';
import { AText } from '@/components/amazen';

export interface SignPadHandle {
  /** The drawing as a PNG data URL; null when nothing was drawn. */
  toPng: () => Promise<string | null>;
  clear: () => void;
}

/**
 * A signature pad INSIDE a sheet — `.sig` in the mockup.
 *
 * ⚠️ NOT `SignatureCapture`. That opens a raw full-screen `<Modal>` of its own,
 * and a modal opened from inside a sheet is the second presentation UIKit
 * refuses (see `blur-sheet.tsx`). This is the same native pad
 * (`NativeSignaturePad`: PanResponder + SVG, exported through the same PNG
 * pipeline), drawn in place.
 *
 * The pad paints a white ground INTO the picture — a transparent PNG in a PDF
 * reads as unsigned — so it is paper-white in both themes, on purpose.
 */
export const SignPad = forwardRef<SignPadHandle, {
  hint: string;
  onInk: (has: boolean) => void;
  /** A finger is on the pad — the sheet holds its scroll still. */
  onTouching?: (on: boolean) => void;
  height?: number;
}>(({ hint, onInk, onTouching, height = 130 }, ref) => {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const pad = useRef<NativeSignaturePadHandle>(null);
  const [ink, setInk] = useState(false);

  useImperativeHandle(ref, () => ({
    toPng: async () => (pad.current ? pad.current.toPng() : null),
    clear: () => pad.current?.clear(),
  }), []);

  const change = (has: boolean) => { setInk(has); onInk(has); };

  return (
    <View>
      <View
        onTouchStart={() => onTouching?.(true)}
        onTouchEnd={() => onTouching?.(false)}
        onTouchCancel={() => onTouching?.(false)}
        style={{
          height,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: ink ? c.accent : c.lineField,
        }}
      >
        <NativeSignaturePad ref={pad} penColor="#1e293b" strokeWidth={2.6} onChange={change} />
        {!ink ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 14, bottom: 10 }}>
            <AText variant="caption" style={{ color: c.inkMuted, fontSize: 11 }}>{hint}</AText>
          </View>
        ) : null}
      </View>
      {ink ? (
        <Pressable
          onPress={() => pad.current?.clear()}
          accessibilityRole="button"
          hitSlop={8}
          style={{ alignSelf: 'flex-end', marginTop: amazen.space(1) }}>
          <AText variant="caption" tone="accent">{t('common.clear')}</AText>
        </Pressable>
      ) : null}
    </View>
  );
});

SignPad.displayName = 'SignPad';
