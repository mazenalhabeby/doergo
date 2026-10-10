"use client"

import { useCallback, useEffect, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CALENDAR_LAYERS, type CalendarLayer } from "@hbcfield/shared/client"
import { calendarApi } from "@/lib/api"
// The global instance (initialised by the root layout), not `@/i18n` — that module
// carries the whole English catalogue into this page's first load (see lib/format-date).
import i18n from "i18next"
import { keys } from "@/lib/query-keys"

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
    // A link that names a view (the Schedule's "open this day") wins once, without becoming the default.
    const linked = linkedDay()?.view
    const v = linked ?? read<CalendarView>(VIEW_KEY, "week")
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
    queryKey: keys.calendar.window(q.from, q.to, q.spaceId ?? "me", layers.join(","), lang),
    queryFn: () => calendarApi.range({ from: q.from, to: q.to, spaceId: q.spaceId, layers, lang }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // With every layer off there is nothing to ask for (an empty list would mean "all" to the server).
    enabled: layers.length > 0,
  })
}

/**
 * `/calendar?date=2026-10-12&view=day` — where a link from elsewhere (the Schedule's wallchart)
 * asks the calendar to open. Read from the address once, on mount; anything malformed is ignored.
 */
export function linkedDay(): { date: Date | null; view: CalendarView | null } | null {
  if (typeof window === "undefined") return null
  const q = new URLSearchParams(window.location.search)
  const d = q.get("date"), v = q.get("view")
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T12:00:00`).getTime()) ? new Date(`${d}T12:00:00`) : null
  const view = v && ["day", "week", "month", "agenda"].includes(v) ? (v as CalendarView) : null
  return date || view ? { date, view } : null
}
