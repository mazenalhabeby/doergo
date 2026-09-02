import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, PanResponder, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * A signature pad with no web page in it.
 *
 * The pad this replaces drew into an HTML canvas inside an embedded browser.
 * That works until it doesn't, and when it doesn't there is nothing to see: the
 * area renders, takes a finger, and keeps nothing — indistinguishable from a
 * pad that is simply waiting. Chasing it meant chasing touch handling across a
 * boundary we do not control, on a device we cannot attach a debugger to.
 *
 * This draws with the platform's own touch handling and renders with
 * react-native-svg, which is already compiled into the app. Fewer moving parts,
 * and every one of them inspectable:
 *
 *   • touches come from PanResponder — the same mechanism every other gesture
 *     in this app uses, so if a finger reaches the screen it reaches here
 *   • strokes are SVG paths, so nothing is rasterised until the moment of
 *     export and the drawing never blurs
 *   • the PNG comes from Svg.toDataURL, which keeps the existing pipeline
 *     untouched: the server still receives the same base64 image it always did
 *
 * Being pure JS over an already-linked native module, it also ships as an
 * over-the-air update — which matters when the thing being fixed is the reason
 * somebody cannot sign today.
 */

export interface NativeSignaturePadHandle {
  clear: () => void;
  /** Resolves null when nothing has been drawn — an empty pad is not a signature. */
  toPng: () => Promise<string | null>;
  isEmpty: () => boolean;
}

interface Props {
  penColor?: string;
  strokeWidth?: number;
  /** Fired on the first point of the first stroke. */
  onBegin?: () => void;
  onChange?: (hasInk: boolean) => void;
}

export const NativeSignaturePad = forwardRef<NativeSignaturePadHandle, Props>(
  ({ penColor = '#1e293b', strokeWidth = 2.6, onBegin, onChange }, ref) => {
    const svgRef = useRef<Svg>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    /*
      Finished strokes in state, the live one in a ref.

      A re-render per touch point would drop points on an older phone — the
      gesture outruns React. The stroke being drawn is therefore accumulated in
      a ref and pushed through a single fast-updating string, and only lands in
      state when the finger lifts.
    */
    const [strokes, setStrokes] = useState<string[]>([]);
    const [live, setLive] = useState<string>('');
    const current = useRef<string>('');
    const began = useRef(false);

    const emitInk = useCallback(
      (has: boolean) => {
        onChange?.(has);
      },
      [onChange],
    );

    const responder = useRef(
      PanResponder.create({
        // Claim the gesture immediately and keep it: a signature is a drag, and
        // anything that can steal a drag mid-stroke (a scroll view, a modal's
        // dismiss gesture) would cut the stroke in half.
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current = `M${locationX.toFixed(2)},${locationY.toFixed(2)}`;
          setLive(current.current);
          if (!began.current) {
            began.current = true;
            onBegin?.();
          }
          emitInk(true);
        },

        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current += ` L${locationX.toFixed(2)},${locationY.toFixed(2)}`;
          setLive(current.current);
        },

        onPanResponderRelease: () => {
          const done = current.current;
          current.current = '';
          setLive('');
          // A tap with no movement is a dot, which is a legitimate mark — keep
          // it rather than silently discarding what somebody just did.
          if (done) setStrokes((s) => [...s, done]);
        },

        onPanResponderTerminate: () => {
          const done = current.current;
          current.current = '';
          setLive('');
          if (done) setStrokes((s) => [...s, done]);
        },
      }),
    ).current;

    const clear = useCallback(() => {
      current.current = '';
      began.current = false;
      setLive('');
      setStrokes([]);
      emitInk(false);
    }, [emitInk]);

    useImperativeHandle(
      ref,
      () => ({
        clear,
        isEmpty: () => strokes.length === 0 && !current.current,
        toPng: () =>
          new Promise((resolve) => {
            if (strokes.length === 0 && !current.current) return resolve(null);
            const node = svgRef.current;
            if (!node?.toDataURL) return resolve(null);
            /*
              Exported flattened onto the white background the Svg already
              paints. A transparent PNG dropped into a PDF shows nothing at all
              — indistinguishable from an unsigned document, which is the one
              outcome this must never produce.
            */
            node.toDataURL((base64) => {
              resolve(base64 ? `data:image/png;base64,${base64}` : null);
            });
          }),
      }),
      [clear, strokes],
    );

    const onLayout = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize({ width, height });
    };

    return (
      <View style={styles.fill} onLayout={onLayout} {...responder.panHandlers}>
        {size.width > 0 && size.height > 0 && (
          <Svg ref={svgRef} width={size.width} height={size.height} style={styles.fill}>
            {/* The white ground, drawn INSIDE the svg so it is part of the
                exported image rather than only part of the screen. */}
            <Path d={`M0,0 H${size.width} V${size.height} H0 Z`} fill="#ffffff" />
            {strokes.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke={penColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {live !== '' && (
              <Path
                d={live}
                stroke={penColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>
        )}
      </View>
    );
  },
);

NativeSignaturePad.displayName = 'NativeSignaturePad';

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%', height: '100%' },
});
