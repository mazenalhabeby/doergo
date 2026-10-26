"use client"

import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
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
          size="pill"
          onClick={onBack}
          className="-ml-3 mb-6 text-muted-foreground hover:text-foreground"
        >
          <Icon name="backLine" />
          {t("members.detail.backToTeam")}
        </Button>
        <div className="text-center py-20">{children}</div>
      </div>
    </div>
  )
}
