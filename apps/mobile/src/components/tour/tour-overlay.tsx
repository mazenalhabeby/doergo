/**
 * Presentational overlay for a single active step. RN can't cut a hole in a
 * View (no box-shadow trick), so we dim with FOUR rectangles around the target
 * (top/left/right/bottom) + a highlight ring, and a tooltip card. The
 * full-screen root intercepts background touches so the tour stays guided.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen/text';
import type { TargetRect, TourStep } from './types';

const DIM = 'rgba(2,8,6,0.66)';
const GAP = 12;
const EDGE = 16;
/** A generous estimate of the card's height, to decide above or below. */
const CARD_EST_H = 190;

export function TourOverlay({
  rect,
  step,
  position,
  total,
  onNext,
  onBack,
  onSkip,
  onTapTarget,
}: {
  rect: TargetRect;
  step: TourStep;
  /** 1-based position among the steps this member will actually see. */
  position: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onTapTarget: () => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  const isTap = step.action === 'tap';
  const isLast = position >= total;

  /*
    ⚠️ DRAWN IN THE OVERLAY'S OWN COORDINATES, NOT THE WINDOW'S.

    Targets are measured with `measureInWindow`, and this overlay used to draw
    those numbers as if its own top-left were the window's. It is not always:
    on Android, edge to edge, the two disagree by the status bar — so the ring
    sat a status bar BELOW the thing the words described, which is exactly
    "it describes the header but highlights under it". The overlay now measures
    where IT is in the window and subtracts, so both numbers come from one
    ruler on every platform. Nothing draws until that is known.
  */
  const root = useRef<View>(null);
  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    root.current?.measureInWindow((x, y) => setFrame({ x, y, w: width, h: height }));
  }, []);

  const pad = step.padding ?? 8;
  const SW = frame?.w ?? 0;
  const SH = frame?.h ?? 0;
  const hx = Math.max(0, rect.x - (frame?.x ?? 0) - pad);
  const hy = Math.max(0, rect.y - (frame?.y ?? 0) - pad);
  const hw = Math.min(SW - hx, rect.width + pad * 2);
  const hh = Math.min(SH - hy, rect.height + pad * 2);
  const radius = Math.min(step.radius ?? 18, hh / 2, hw / 2);

  const tipW = Math.min(360, SW - EDGE * 2);
  /*
    ⚠️ PLACED BY ITS MEASURED HEIGHT. A guessed height put a four-line card
    over the top of the tab it was pointing at. The guess only decides the
    first frame; the card's own layout decides every frame after.
  */
  const [cardH, setCardH] = useState(CARD_EST_H);
  const tipTop = useMemo(() => {
    const below = hy + hh + GAP;
    if (below + cardH < SH - EDGE) return below;
    const above = hy - GAP - cardH;
    if (above >= EDGE) return above;
    // Neither side has room (a tall card): sit at the bottom, over the target's lower part.
    return Math.max(EDGE, SH - cardH - EDGE * 2);
  }, [hy, hh, SH, cardH]);
  const tipLeft = Math.min(Math.max(EDGE, hx + hw / 2 - tipW / 2), SW - tipW - EDGE);

  // Android's back button closes the tour, as it would a sheet.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onSkip(); return true; });
    return () => sub.remove();
  }, [onSkip]);

  return (
    <Host>
    <View ref={root} onLayout={onLayout} style={StyleSheet.absoluteFill} collapsable={false}>
      {frame ? (
        <>
          {/*
            ⚠️ ONE SHAPE WITH A ROUNDED HOLE, not four rectangles. Rectangles
            can only cut a square hole, so behind a round ring the square's
            corners stayed lit — a pill-shaped ring inside a square of light.
          */}
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={`M0 0H${SW}V${SH}H0Z ${roundedRect(hx, hy, hw, hh, radius)}`} fill={DIM} fillRule="evenodd" />
          </Svg>
          {/* The ring follows the target's own shape (`step.radius`). */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: hx,
              top: hy,
              width: hw,
              height: hh,
              borderRadius: radius,
              borderWidth: 2,
              borderColor: c.accent,
            }}
          />

          {isTap && (
            <Pressable
              onPress={onTapTarget}
              accessibilityRole="button"
              style={{ position: 'absolute', left: hx, top: hy, width: hw, height: hh, borderRadius: radius }}
            />
          )}

          <View
            accessibilityViewIsModal
            onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
            style={[
              styles.card,
              { left: tipLeft, top: tipTop, width: tipW, backgroundColor: c.canvas, borderColor: c.lineGlass },
            ]}
          >
            <View style={{ height: 3, backgroundColor: c.lineGlass }}>
              <View style={{ height: 3, width: `${(position / total) * 100}%`, backgroundColor: c.accent }} />
            </View>
            <View style={{ padding: amazen.space(4), gap: amazen.space(1.5) }}>
              <View style={styles.row}>
                <AText
                  style={{
                    color: c.accent,
                    fontFamily: amazen.font.mono,
                    fontSize: 10.5,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                  }}>
                  {t('tours.progress', { current: position, total })}
                </AText>
                <Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('tours.skip')}>
                  <AText style={{ color: c.inkMuted, fontSize: 18, lineHeight: 20 }}>×</AText>
                </Pressable>
              </View>
              <AText variant="h3" tone="strong" style={{ fontFamily: amazen.font.sansMedium, fontSize: 18, lineHeight: 24 }}>
                {t(step.titleKey)}
              </AText>
              <AText variant="body" tone="onGlass" style={{ fontSize: 14, lineHeight: 20 }}>
                {t(step.bodyKey)}
              </AText>
              {isTap ? (
                <AText variant="caption" style={{ color: c.accent, marginTop: amazen.space(1) }}>{t('tours.tapHint')}</AText>
              ) : null}
              <View style={[styles.row, { marginTop: amazen.space(2.5) }]}>
                {position > 1 ? (
                  <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button">
                    <AText variant="body" style={{ color: c.inkMuted, fontSize: 14 }}>‹ {t('common.back')}</AText>
                  </Pressable>
                ) : (
                  <View />
                )}
                {isTap ? (
                  <AText variant="caption" style={{ color: c.inkMuted }}>{t('tours.skip')}</AText>
                ) : (
                  <Pressable
                    onPress={onNext}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      backgroundColor: c.accent,
                      borderRadius: amazen.radius.full,
                      paddingHorizontal: amazen.space(4.5),
                      paddingVertical: amazen.space(2.25),
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <AText style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium, fontSize: 14 }}>
                      {isLast ? t('tours.finish') : t('tours.next')}
                    </AText>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </>
      ) : null}
    </View>
    </Host>
  );
}

/*
  ⚠️ ABOVE THE JOB PAGE, WHICH IS A NATIVE MODAL.

  A View in the app's root sits UNDER a native modal on iOS, so the job tour
  ran — invisibly — behind the page it described. A React Native <Modal> is no
  answer either: iOS refuses to present it while another modal is already up,
  silently. `FullWindowOverlay` is the window-level layer made for this. On
  Android the job page lives in the same window, so a root View drawn last is
  already on top.
*/
function Host({ children }: { children: ReactNode }) {
  if (Platform.OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>{children}</View>;
}

/** A rounded rectangle as an SVG sub-path — the hole in the dimming. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + q} ${y}H${x + w - q}A${q} ${q} 0 0 1 ${x + w} ${y + q}V${y + h - q}A${q} ${q} 0 0 1 ` +
    `${x + w - q} ${y + h}H${x + q}A${q} ${q} 0 0 1 ${x} ${y + h - q}V${y + q}A${q} ${q} 0 0 1 ${x + q} ${y}Z`
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: {
    position: 'absolute',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
});
