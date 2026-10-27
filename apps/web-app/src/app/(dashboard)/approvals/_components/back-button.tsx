"use client"

import { ChevronLeft } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { BACK_BUTTON_ID } from "../_hooks/use-narrow-focus"

/** A narrow screen shows one column at a time: the way back from a decision or a day (focused as it opens). */
export function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button
      id={BACK_BUTTON_ID}
      variant="ghost"
      size="sm"
      className="-ml-2 mb-3 rounded-full lg:hidden"
      onClick={onClick}
    >
      <ChevronLeft className="size-4" />
      {t("approvals.back")}
    </Button>
  )
}
