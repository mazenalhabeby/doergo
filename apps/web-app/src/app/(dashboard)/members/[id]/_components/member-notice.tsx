"use client"

import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PAGE_SHELL } from "@/components/ui/page-width"

// The page with nothing to show but a message (load failure, not found): the
// way back to the team, and the message centred under it.
export function MemberNotice({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("members.detail.backToTeam")}
        </Button>
        <div className="text-center py-20">{children}</div>
      </div>
    </div>
  )
}
