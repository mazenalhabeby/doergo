"use client"

import { Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useCommandPalette } from "@/contexts/command-palette-context"

// ---------------------------------------------------------------------------
// Command Palette Button
// ---------------------------------------------------------------------------
export function CommandPaletteButton() {
  const { setOpen } = useCommandPalette()
  const { t } = useTranslation()
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

  return (
    <button
      onClick={() => setOpen(true)}
      data-tour="nav-command"
      className={"flex w-[190px] lg:w-[240px] items-center gap-2 h-9 px-3 rounded-lg " +
        "border border-border/60 bg-muted/40 text-muted-foreground " +
        "hover:text-foreground hover:bg-muted/80 transition-colors"}
    >
      <Search className="size-4 shrink-0" />
      <span className="hidden sm:inline text-[13px]">{t("common.search")}</span>
      <kbd
        className={"pointer-events-none ml-auto hidden sm:inline-flex h-5 select-none " +
          "items-center gap-0.5 rounded border border-border bg-background px-1.5 " +
          "font-mono text-[10px] font-medium text-muted-foreground"}>
        {isMac ? "\u2318" : "Ctrl+"}K
      </kbd>
    </button>
  )
}
