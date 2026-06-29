"use client"

import { Languages, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { changeLanguage, supportedLanguages } from "@/i18n"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Language switcher for the top navbar.
 * Compact globe-icon trigger → dropdown of supported languages.
 * Selection persists (via changeLanguage → localStorage) and re-renders
 * all `useTranslation` consumers immediately.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  // i18n.language updates reactively (useTranslation subscribes to
  // `languageChanged`), so the active checkmark always reflects the choice.
  const current = i18n.language?.split("-")[0] || "en"
  const activeLang =
    supportedLanguages.find((l) => l.code === current) ?? supportedLanguages[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("common.language")}
        title={t("common.language")}
        className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Languages className="h-4 w-4" />
        <span className="sr-only">{t("common.language")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="min-w-[180px] rounded-lg p-1">
        <DropdownMenuLabel className="px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("common.language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supportedLanguages.map((lang) => {
          const isActive = lang.code === activeLang.code
          return (
            <DropdownMenuItem
              key={lang.code}
              onSelect={() => changeLanguage(lang.code)}
              className={cn(
                "rounded-md cursor-pointer gap-2",
                isActive && "bg-muted/60",
              )}
            >
              <span aria-hidden className="text-base leading-none">{lang.flag}</span>
              <span className="flex-1 text-sm">{lang.label}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
