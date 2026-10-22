import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, type FlatList } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  ShadowDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { Ground, ScreenHeader, SurfaceProvider, useTabSafe } from '../../components/amazen';
import { displayName } from '../../lib/people';
import { impact, selection } from '../../lib/haptics';
import { announce, useScreenReader } from '../../hooks/use-a11y';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { useOffline } from '../../offline/offline-context';
import { connectivity } from '../../offline/connectivity';
import { EmptyArrange } from './empty-arrange';
import { EmptyHome, type Suggestion } from './empty-home';
import { DropSlot, EditableWidget, LIFT_FACTOR } from './editable-widget';
import { WidgetGallery } from './widget-gallery';
import { ActionStrip } from './action-strip';
import { JobsStrip } from './jobs-strip';
import { TourTarget } from '../tour/tour-target';
import { editShortcutsOnArrival } from './shortcuts-card';
import { answerFor, useWidgetAnswers } from './answers';
import { useHomeEditing } from './use-home-editing';
import { useHomeLayout } from './use-home-layout';
import { EMPTY_ROWS, widgetTitle, type WidgetRow } from './registry';
import { HomeCard, HomeLoadContext, useHomeLoadQueue } from './home-load';
import { useHomeScreen } from './use-home-screen';
import { renderDropSlot, styles } from './home-screen-helpers';

export function HomeScreen() {
  const {
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
  } = useHomeScreen();

  return (
    <HomeLoadContext.Provider value={loadQueue}>
    <Ground>
      {/*
        ⚠️ OUTSIDE THE LIST, so it does not scroll away — and so nothing put in
        it can move the column. That second reason is why the ＋ lives here:
        a dashed "Add a widget" row at the head of the column was worth about
        60pt and shoved every widget down the instant the mode opened, under
        the finger that had just opened it.
      */}
      <ScreenHeader
        title={fullName}
        tour={editing ? undefined : { title: 'home-greeting', avatar: 'home-avatar' }}
        hint={
          editing
            ? t('home.edit.hint', { defaultValue: 'Hold to move · tap ⊖ to remove' })
            : undefined
        }
        actions={
          editing
            ? [
                {
                  /*
                    ⚠️ A SYMBOL, BECAUSE TWO WORDS DO NOT FIT BESIDE A NAME.
                    "＋ Add a widget" and "Done" together pushed the member's
                    own name into an ellipsis — JOHN OWN…
                  */
                  label: '＋',
                  a11yLabel: t('home.edit.add', { defaultValue: 'Add a widget' }),
                  onPress: () => setPicking(true),
                },
                {
                  label: t('common.done', { defaultValue: 'Done' }),
                  active: true,
                  onPress: () => leaveEdit(),
                },
              ]
            : undefined
        }
      />

      <DraggableFlatList
        ref={listRef as never}
        onScrollToIndexFailed={() => {}}
        /* ⚠️ The library's prop is a mutable `T[]`; it never writes to it. */
        data={rows as WidgetRow[]}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewability}
        onDragEnd={onDragEnd}
        /* ⚠️ A TICK EACH TIME A CARD CROSSES ANOTHER — it is the only signal
           that the order under the thumb actually changed. */
        onPlaceholderIndexChange={selection}
        renderPlaceholder={renderDropSlot}
        /*
          ⚠️ IT FIGHTS THE iOS BACK-SWIPE. Without a distance the pan claims
          the touch immediately, so an edge swipe to go back is read as a drag
          and the member is stuck on a screen the whole platform says they can
          leave. A distance turns it into `activeOffsetY`, so a horizontal
          move is never a drag.
        */
        activationDistance={14}
        /* §3 — auto-scroll within 60pt of an edge. */
        autoscrollThreshold={60}
        containerStyle={styles.fill}
        /*
          ⚠️ 14, not `layout.gutter` (20). Measured off the design reference:
          the shift card's edge and the tab pill's are the same 14pt inset, and
          a column that does not line up with the bar under it is the first
          thing the eye catches.
        */
        contentContainerStyle={contentStyle}
        ListHeaderComponent={
          /* ⚠️ ONE line that says what the network is doing, for the whole
             column. Per widget it would be four copies of one sentence. */
          <>
            <OfflineBanner style={{ marginBottom: amazen.space(3) }} />
            {/* ⭐ What the app needs from the member. Chrome, not a widget —
                never in the registry — and away while arranging, so nothing
                above the column moves under the finger. */}
            {editing ? null : <TourTarget name="home-needs"><ActionStrip /></TourTarget>}
            {/* Stopped work: a handover note owed, or a paused job to pick back up. */}
            {editing ? null : <JobsStrip />}
          </>
        }
        ListEmptyComponent={
          /*
            ⚠️ §1'S EMPTY HOME EARNS ITS PLACE ONLY WHEN THERE IS SOMETHING TO
            PREVIEW. It is built around two real cards at .42 and a Keep pill —
            "here is what you would be seeing right now" — and with nothing to
            show, that sentence sits over blank space above no control at all.
            Which is what a member got on every launch while the registry was
            being rebuilt: a dead screen, with the way forward nowhere on it.

            So the question is not "is the member editing", it is "is there
            anything to suggest". With suggestions, §1. Without them — and
            always while arranging, where a preview answers a question nobody
            asked — the slot: the mark, what they have, and the way to add one.
          */
          suggestions.length > 0 && !editing ? (
            <EmptyHome
              suggestions={suggestions}
              totalAvailable={layout.available.length}
              onKeep={(key) => { layout.show(key); }}
              onKeepBoth={() => {
                suggestions.forEach((s) => layout.show(s.row.key));
              }}
              onSeeAll={() => setPicking(true)}
            />
          ) : (
            <EmptyArrange
              totalAvailable={layout.available.length}
              arranging={editing}
              /* They had some and removed them, rather than never having any. */
              emptied={layout.offScreen.length > 0 && editing}
              onAdd={() => setPicking(true)}
            />
          )
        }
        ListFooterComponent={
          editing ? (
            /*
              ⚠️ LEAVING IS "DONE, OR A TAP ANYWHERE THAT IS NOT A CARD" — and
              this is that anywhere. Every card absorbs its own taps, so the
              only thing left to hit is the space under the column; giving it a
              floor means there is always some, even when the widgets fill the
              screen. It is also the room the bottom card needs to be dragged
              past, and it is BELOW everything, so adding it moves nothing.
            */
            <Pressable
              onPress={() => leaveEdit()}
              accessibilityRole="button"
              accessibilityLabel={t('common.done', { defaultValue: 'Done' })}
              style={{ minHeight: 180 }}
            />
          ) : null
        }
        refreshControl={
          /*
            ⚠️ NO PULL-TO-REFRESH WHILE EDITING, and this was a real bug: a
            widget near the top dragged DOWNWARD triggered the refresh spinner
            instead of moving, because `RefreshControl` claims a downward
            gesture whenever the list is at the top — before the pan can
            decide. It is also the wrong offer: somebody rearranging their home
            screen is not asking for fresher numbers.
          */
          editing ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={amazen.color.accent}
            />
          )
        }
        showsVerticalScrollIndicator={false}
        /*
          ⚠️ ANDROID-ONLY, AND ONLY BECAUSE A WIDGET CAN BE DRAGGED. Subview
          clipping DETACHES a child once it leaves the visible window — and a
          card under a finger is translated well outside its own slot, so the
          thing being dragged is exactly the thing that gets detached.
        */
        removeClippedSubviews={false}
      />

      {/*
        ⚠️ THE GALLERY SHOWS THE WIDGET, NEVER A LABEL. One per page, swiped
        sideways, the real component at full size with real data.
      */}
      <WidgetGallery
        visible={picking}
        rows={layout.available}
        onHome={onHomeKeys}
        hasData={(row) => answerFor(answers, row.key).ready}
        /*
          ⚠️ THE GALLERY STAYS OPEN. Several can be added in one visit; each
          lands under the first card (or after the one added before it), so
          what was just chosen is where the eye already is.
        */
        onAdd={(key, after) => layout.add(key, after)}
        onUndo={(key) => layout.hide(key)}
        onClose={(added) => {
          setPicking(false);
          if (!added.length) return;
          // Shortcuts is chosen, not configured later: its editor opens on arrival.
          if (added.includes('shortcuts')) editShortcutsOnArrival();
          /*
            ⚠️ DONE DROPS YOU INTO ARRANGING, at the first new card, each one
            ringed — the member placed nothing yet, and now they can.
          */
          enterEdit();
          land(added);
          const i = rows.findIndex((r) => r.key === added[0]);
          if (i >= 0) setTimeout(() => listRef.current?.scrollToIndex({ index: i, viewPosition: 0.2, animated: true }), 350);
        }}
      />
    </Ground>
    </HomeLoadContext.Provider>
  );
}
