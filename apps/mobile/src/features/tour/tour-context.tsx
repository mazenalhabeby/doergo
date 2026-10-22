/**
 * Guided-tour engine (React Native). Mirrors the web TourProvider: auto-run a
 * role-appropriate tour once per screen, a Help launcher, "Take a tour", and the
 * two web bug-fixes (start() navigates to the tour's screen; dismissing marks it
 * completed so auto-run doesn't immediately re-open it).
 *
 * RN specifics: targets are measured via a ref registry (no DOM); navigation via
 * expo-router; step.enter runs a registered callback (no synthetic clicks).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Dimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { hasAccessModule, hasFeatureModule, normalizeRole } from '@hbcfield/shared/client';

import { useAuth } from '@/contexts/auth-context';
import { TOURS } from './registry';
import { tabAccessFor } from '@/lib/tab-layout';
import { createTourStorage } from './tour-storage';
import { useTargetRegistry } from './tour-target';
import { TourOverlay } from './tour-overlay';
import {
  beginSettle,
  boxesAgree,
  isDrawableBox,
  settleTick,
  MEASURE_INTERVAL_MS,
  type Viewport,
} from './measure';
import type { TargetRect, TourDef, TourGateContext } from './types';
import { useTourProvider, type TourContextValue } from './use-tour-provider';
import { Ctx } from './tour-provider-helpers';

export function TourProvider({ children }: { children: ReactNode }) {
  const {
    api,
    Provider,
    shown,
    tour,
    stop,
    next,
    back,
    onTapTarget,
    progress,
    value,
  } = useTourProvider({ children });

  return (
    <Ctx.Provider value={value}>
      <Provider value={api}>
        {children}
        {/* Rendered from `shown`, never from `stepIndex`: the words and the
            highlight are one value, so they can never describe different things. */}
        {tour && shown && tour.steps[shown.index] && (
          <TourOverlay
            rect={shown.rect}
            step={tour.steps[shown.index]!}
            position={progress.position}
            total={progress.total}
            onNext={next}
            onBack={back}
            onSkip={stop}
            onTapTarget={onTapTarget}
          />
        )}
      </Provider>
    </Ctx.Provider>
  );
}

export function useTour() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTour must be used within <TourProvider>');
  return ctx;
}
