"use client"

import { useCallback, useEffect, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CALENDAR_LAYERS, type CalendarLayer } from "@hbcfield/shared/client"
import { calendarApi } from "@/lib/api"
import i18n from "@/i18n"

export type CalendarView = "day" | "week" | "month" | "agenda"

const LAYERS_KEY = "hbcfield-calendar-layers"
const VIEW_KEY = "hbcfield-calendar-view"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private window — the choice lasts this visit */
  }
}

/** Which layers are on — remembered per browser, everything on by default. */
export function useLayers() {
  const [layers, setLayers] = useState<CalendarLayer[]>([...CALENDAR_LAYERS])
  useEffect(() => {
    const saved = read<string[]>(LAYERS_KEY, [])
    const valid = saved.filter((l): l is CalendarLayer => (CALENDAR_LAYERS as readonly string[]).includes(l))
    if (valid.length) setLayers(valid)
  }, [])
  const toggle = useCallback((l: CalendarLayer) => {
    setLayers((cur) => {
      const next = cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]
      write(LAYERS_KEY, next)
      return next
    })
  }, [])
  return { layers, toggle }
}

export function useStoredView(): [CalendarView, (v: CalendarView) => void] {
  const [view, setView] = useState<CalendarView>("week")
  useEffect(() => {
    const v = read<CalendarView>(VIEW_KEY, "week")
    if (["day", "week", "month", "agenda"].includes(v)) setView(v)
  }, [])
  return [view, (v) => { setView(v); write(VIEW_KEY, v) }]
}

/**
 * The calendar for a window. Layers are filtered on the SERVER (a switched-off layer is never
 * fetched) but the cache key holds the full set, so toggling back is instant from cache.
 */
export function useCalendarRange(q: { from: string; to: string; spaceId: string | null; layers: CalendarLayer[] }) {
  const lang = (i18n.language || "en").slice(0, 2)
  const layers = [...q.layers].sort()
  return useQuery({
    queryKey: ["calendar", q.from, q.to, q.spaceId ?? "me", layers.join(","), lang],
    queryFn: () => calendarApi.range({ from: q.from, to: q.to, spaceId: q.spaceId, layers, lang }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // With every layer off there is nothing to ask for (an empty list would mean "all" to the server).
    enabled: layers.length > 0,
  })
}
