"use client"

import { PanelRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useActivityPanel } from "@/contexts/activity-panel-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ActivityPanelToggle() {
  const { isOpen, toggle } = useActivityPanel()
  const { t } = useTranslation()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn("h-9 w-9 rounded-lg", isOpen && "bg-accent")}
      title={isOpen ? t("nav.hideActivityPanel") : t("nav.showActivityPanel")}
    >
      <PanelRight className="h-4 w-4" />
    </Button>
  )
}
