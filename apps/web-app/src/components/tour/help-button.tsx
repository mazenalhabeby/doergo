"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Compass, BookOpen, ChevronRight, Play } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useTour } from "./tour-context"
import { TourIcon } from "./tour-icons"
import { TOURS } from "./registry"

/**
 * Always-visible Help & guides launcher for the top bar. From any page it offers
 * a walkthrough of the CURRENT screen, every guide the user is eligible for, and
 * a link to the Help center to search or ask. This is the persistent "guide me"
 * affordance — available on every page, not buried in a menu.
 */
export function HelpButton() {
  const { t } = useTranslation()
  const { availableTours, contextualTourId, start } = useTour()
  const [open, setOpen] = useState(false)

  const contextual = contextualTourId ? TOURS.find((tr) => tr.id === contextualTourId) : null

  const run = (id: string) => {
    setOpen(false)
    // let the popover close before the spotlight paints
    window.setTimeout(() => start(id), 60)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("tours.help.button")}
          title={t("tours.help.button")}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Compass className="size-[19px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-80 rounded-xl p-0">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Compass className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">{t("tours.help.title")}</p>
            <p className="text-[11px] text-muted-foreground">{t("tours.help.subtitle")}</p>
          </div>
        </div>

        <div className="p-2">
          {/* Contextual: show me around THIS page */}
          {contextual ? (
            <button
              type="button"
              onClick={() => run(contextual.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-gradient-to-r from-primary/[0.06] to-transparent p-3 text-left transition-colors hover:border-primary/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Play className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-foreground">{t("tours.help.thisPage")}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{t(contextual.titleKey)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-primary" />
            </button>
          ) : (
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-[12px] text-muted-foreground">
              {t("tours.help.noneForPage")}
            </div>
          )}

          {/* All guides */}
          {availableTours.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("tours.help.allGuides")}
              </p>
              <div className="max-h-64 overflow-auto">
                {availableTours.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => run(tr.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted",
                      tr.id === contextualTourId && "text-primary",
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <TourIcon name={tr.icon} className="size-[15px]" />
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-foreground">{t(tr.titleKey)}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Help center */}
          <div className="mt-2 border-t border-border pt-2">
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <BookOpen className="size-[15px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">{t("tours.help.helpCenter")}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t("tours.help.helpCenterDesc")}</span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
