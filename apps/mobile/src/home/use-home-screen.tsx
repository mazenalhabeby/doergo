import React, { useCallback, useState } from 'react';
import { type FlatList } from 'react-native';
import { ScaleDecorator, ShadowDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { SurfaceProvider, useTabSafe } from '../components/amazen';
import { displayName } from '../lib/people';
import { impact } from '../lib/haptics';
import { announce, useScreenReader } from '../hooks/use-a11y';
import { useOffline } from '../offline/offline-context';
import { connectivity } from '../offline/connectivity';
import { type Suggestion } from '../components/home/empty-home';
import { EditableWidget, LIFT_FACTOR } from '../components/home/editable-widget';
import { TourTarget } from '../components/tour/tour-target';
import { answerFor, useWidgetAnswers } from './answers';
import { useHomeEditing } from './use-home-editing';
import { useHomeLayout } from './use-home-layout';
import { EMPTY_ROWS, widgetTitle, type WidgetRow } from './registry';
import { HomeCard, useHomeLoadQueue } from './home-load';
import { useHomeScreenData } from './use-home-screen-data';

/**
 * The first card on the home, as the tour's "these are your widgets" step.
 * Only the first: one ring says "cards like this", five would say nothing.
 */
export function WidgetAnchor({ first, children }: { first: boolean; children: React.ReactNode }) {
  return first ? <TourTarget name="home-widgets">{children}</TourTarget> : <>{children}</>;
}

/** HomeScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useHomeScreen() {
  const {
    amazen,
    isDark,
    contentStyle,
    t,
    refreshKey,
    refreshing,
    picking,
    setPicking,
    editing,
    enterEdit,
    leaveEdit,
    landed,
    land,
    listRef,
    layout,
    screenReader,
    onRefresh,
    answers,
    rows,
    suggestions,
    fullName,
    moveBy,
  } = useHomeScreenData();

  const removeWidget = useCallback((key: string) => layout.hide(key), [layout]);

  /*
    ⚠️ `onDragEnd` FIRES ONCE, WITH THE NEW ORDER — §7. It is where the change
    is written and where the undo starts. Not `onPlaceholderIndexChange`, which
    fires on every crossing and would write a dozen records for one gesture.
  */
  const onDragEnd = useCallback(
    ({ data, from, to }: { data: WidgetRow[]; from: number; to: number }) => {
      if (from === to) return;
      layout.setOrder(data.map((r) => r.key));
      impact('medium');
    },
    [layout],
  );

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<WidgetRow>) => {
      const index = getIndex() ?? 0;
      return (
        /*
          ⚠️ THE TWO DECORATORS §7 NAMES, AND NO ROTATION. Neither platform
          tilts a dragged card — a tilt says "torn loose", and this one is
          still in a column that is about to close around it.
        */
        <ScaleDecorator activeScale={LIFT_FACTOR}>
          {/* ⚠️ FED THE GLASS SHADOW — the same numbers `shadowGlass()` gives
              every card in the kit, so a lifted card is lit like the cards it
              is being lifted out of rather than like a generic list row. */}
          <ShadowDecorator
            elevation={isDark ? 6 : 4}
            radius={isDark ? 24 : 22}
            color={isDark ? '#000' : '#0b332a'}
            opacity={isDark ? 0.45 : 0.1}
          >
            {/* ⭐ THE FIRST CARD LEADS — glass at the top, a well everywhere else (amazen/surfaces.tsx). */}
            <SurfaceProvider value={index === 0 ? 'glass' : 'well'}>
            <WidgetAnchor first={index === 0 && !editing}>
            <HomeCard id={item.key} restHeight={item.restHeight}>
            <EditableWidget
              key={`${item.key}:${refreshKey}`}
              row={item}
              editing={editing}
              isActive={isActive}
              drag={drag}
              onEnterEdit={enterEdit}
              onRemove={removeWidget}
              onMove={moveBy}
              canUp={index > 0}
              canDown={index < rows.length - 1}
              screenReader={screenReader}
              landed={landed.includes(item.key)}
            />
            </HomeCard>
            </WidgetAnchor>
            </SurfaceProvider>
          </ShadowDecorator>
        </ScaleDecorator>
      );
    },
    [editing, enterEdit, isDark, landed, moveBy, refreshKey, removeWidget, rows.length, screenReader],
  );

  const onHomeKeys = React.useMemo(() => new Set(rows.map((r) => r.key)), [rows]);

  /*
    ⭐ THE ORDER THE HOME ASKS IN — the member's own (home-load / load-queue).
    What the list reports as on screen, plus the card just below it, is asked
    first; the rest waits its turn. Refs, because FlatList refuses a new
    `onViewableItemsChanged` after the first render.
  */
  const loadOrder = React.useMemo(() => rows.map((r) => r.key), [rows]);
  const loadQueue = useHomeLoadQueue(loadOrder);
  const onViewable = React.useRef(({ viewableItems }: { viewableItems: Array<{ item: WidgetRow; index: number | null }> }) => {
    const shown = viewableItems.map((v) => v.item.key);
    const last = Math.max(-1, ...viewableItems.map((v) => v.index ?? -1));
    const next = rowsRef.current[last + 1]?.key;
    loadQueue.setVisible(next ? [...shown, next] : shown);
  }).current;
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const viewability = React.useRef({ itemVisiblePercentThreshold: 1 }).current;

  return {
    amazen,
    contentStyle,
    t,
    refreshing,
    picking,
    setPicking,
    editing,
    enterEdit,
    leaveEdit,
    land,
    listRef,
    layout,
    onRefresh,
    answers,
    rows,
    suggestions,
    fullName,
    onDragEnd,
    renderItem,
    onHomeKeys,
    loadQueue,
    onViewable,
    viewability,
  };
}
