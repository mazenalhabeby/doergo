"use client"

import { useTranslation } from "react-i18next"
import { useCommandPalette } from "@/contexts/command-palette-context"
import { Icon } from "@/components/ui/icon"

// ---------------------------------------------------------------------------
// Command Palette Button
// ---------------------------------------------------------------------------
export function CommandPaletteButton() {
  const { setOpen } = useCommandPalette()
  const { t } = useTranslation()
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      data-tour="nav-command"
      aria-keyshortcuts="Meta+K Control+K"
      aria-label={t("common.search")}
      className={
        "flex h-11 w-11 shrink-0 items-center justify-center gap-2.5 rounded-full border border-shell-line " +
        "bg-shell-card text-sm text-shell-soft shadow-[var(--shell-shadow)] transition-colors " +
        "sm:w-auto sm:min-w-0 sm:max-w-[380px] sm:flex-1 sm:justify-start sm:pl-4 sm:pr-2 " +
        "hover:text-shell-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent"
      }
    >
      <Icon name="searchLine" size={17} />
      <span className="hidden flex-1 truncate text-left sm:block">{t("common.search")}</span>
      <kbd className="hidden select-none rounded-lg bg-shell-chip px-2 py-1 font-mono text-[11px] sm:inline">
        {isMac ? "\u2318" : "Ctrl+"}K
      </kbd>
    </button>
  )
}
