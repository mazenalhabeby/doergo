"use client"

import { useEffect, useReducer, useSyncExternalStore } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import {
  createDeferredGate,
  DEFERRED_MAX_DELAY_MS,
  DEFERRED_MIN_DELAY_MS,
  DEFERRED_WAVE_GAP_MS,
  waveStarted,
  type DeferredGate,
  type DeferredWave,
} from "@/lib/deferred-start"

/*
  One gate per QueryClient (in practice: one per app session). A WeakMap rather
  than a module variable so a test that builds its own client gets its own gate.
*/
const gates = new WeakMap<QueryClient, DeferredGate>()

function gateFor(qc: QueryClient): DeferredGate {
  let gate = gates.get(qc)
  if (!gate) {
    gate = createDeferredGate({
      minDelayMs: DEFERRED_MIN_DELAY_MS,
      maxDelayMs: DEFERRED_MAX_DELAY_MS,
      isBusy: () => qc.isFetching() > 0,
      subscribeBusy: (onChange) => qc.getQueryCache().subscribe(onChange),
    })
    gates.set(qc, gate)
  }
  return gate
}

const serverSnapshot = () => false

/**
 * `true` once the page's first load is over (see `lib/deferred-start.ts`).
 *
 * For reads the first paint does not need — badge counts, the billing ribbon,
 * the clock-in site list, a sidebar action that may or may not appear. Pass it
 * as part of a query's `enabled`:
 *
 *   const afterLoad = useAfterFirstLoad()
 *   useQuery({ ..., enabled: signedIn && afterLoad })
 *
 * Never for what the page is FOR: that would only move the wait in front of
 * the person.
 *
 * `wave` spreads the deferred reads out (DEFERRED_WAVE_GAP_MS apart) so the
 * gate opening is not a burst of its own.
 */
export function useAfterFirstLoad(wave: DeferredWave = 0): boolean {
  const qc = useQueryClient()
  const gate = gateFor(qc)
  const open = useSyncExternalStore(gate.subscribe, gate.isOpen, serverSnapshot)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    gate.start()
  }, [gate])

  const openedAt = open ? gate.openedAt() : null
  const ready = waveStarted(wave, openedAt === null ? null : Date.now() - openedAt)
  useEffect(() => {
    if (!open || ready || openedAt === null) return
    const wait = wave * DEFERRED_WAVE_GAP_MS - (Date.now() - openedAt)
    const t = setTimeout(rerender, Math.max(0, wait))
    return () => clearTimeout(t)
  }, [open, ready, openedAt, wave])
  return ready
}
