"use client"

import { useTranslation } from "react-i18next"
import { Compass } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useTour } from "./tour-context"

/**
 * "Take a tour" entry for the user menu — walks the CURRENT page if it has a
 * tour, otherwise falls back to the first eligible tour (which start() will
 * navigate to). Renders nothing if the user has no eligible tours.
 */
export function TourLauncherMenuItem() {
  const { t } = useTranslation()
  const { availableTours, contextualTourId, start } = useTour()
  const target = contextualTourId ?? availableTours[0]?.id
  if (!target) return null
  return (
    <DropdownMenuItem onSelect={() => start(target)} className="rounded-md cursor-pointer">
      <Compass className="mr-2 h-4 w-4 text-muted-foreground" />
      {t("tours.takeTour")}
    </DropdownMenuItem>
  )
}
