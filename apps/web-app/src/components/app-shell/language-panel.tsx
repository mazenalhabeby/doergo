"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { changeLanguage, supportedLanguages } from "@/i18n/languages"

const BACK =
  "grid size-8 place-items-center rounded-[10px] bg-shell-hover outline-none focus-visible:ring-2 focus-visible:ring-shell-accent"
const FIELD =
  "mx-1 mb-2 flex h-[38px] items-center gap-2 rounded-xl border border-shell-line bg-shell-hover px-3 " +
  "focus-within:ring-2 focus-within:ring-shell-accent"
const INPUT =
  "min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none ring-0 placeholder:text-shell-soft " +
  "focus:outline-none focus:ring-0"

/** The language panel inside the menu: search by its own name or yours, then one tap. */
export function LanguagePanel({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const [q, setQ] = useState("")
  const current = i18n.language?.split("-")[0] || "en"
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([current], { type: "language" })
    } catch {
      return null
    }
  }, [current])
  const rows = supportedLanguages
    .map((l) => ({ ...l, inYours: names?.of(l.code) ?? l.label }))
    .filter((l) => {
      const needle = q.trim().toLowerCase()
      return !needle || `${l.label} ${l.inYours} ${l.code}`.toLowerCase().includes(needle)
    })

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 pt-1">
        <button type="button" onClick={onBack} aria-label={t("common.back", "Back")} className={BACK}>
          <ChevronLeft className="size-4" />
        </button>
        <b className="flex-1 text-[15px]">{t("common.language", "Language")}</b>
        <span className="text-xs text-shell-soft">{t("account.onlyForYou", "only for you")}</span>
      </div>
      <label className={FIELD}>
        <Search aria-hidden className="size-[15px] text-shell-soft" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder={t("account.languageSearch", "Search — any language, any spelling")}
          aria-label={t("account.languageSearch", "Search — any language, any spelling")}
          className={INPUT}
        />
      </label>
      <div className="flex max-h-72 flex-col overflow-y-auto">
        {rows.map((l) => {
          const on = l.code === current
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => changeLanguage(l.code)}
              aria-pressed={on}
              className={cn(
                "grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl p-2 text-left outline-none",
                "transition-colors hover:bg-shell-hover focus-visible:ring-2 focus-visible:ring-shell-accent",
                on && "bg-shell-hover",
              )}
            >
              <span className="grid size-[34px] place-items-center rounded-[10px] bg-shell-chip text-[11.5px] font-bold uppercase">
                {l.code}
              </span>
              <span className="flex min-w-0 flex-col">
                <b className="truncate text-sm">{l.label}</b>
                <span className="truncate text-xs text-shell-soft">{l.inYours}</span>
              </span>
              <span aria-hidden className="text-[15px] text-shell-accent">
                {on ? "✓" : ""}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-1 border-t border-shell-line px-2.5 pt-2.5 text-[12.5px] text-shell-soft">
        {t("account.languageNote", "Dates, numbers and money follow the language.")}
      </p>
    </div>
  )
}
