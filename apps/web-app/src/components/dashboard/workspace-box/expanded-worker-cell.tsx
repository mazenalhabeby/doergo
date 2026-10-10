"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { PersonNodeProps } from "../person-node"
import { WorkerAvatar } from "../worker-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { APPLE_EASE } from "./constants"
import { WorkerDropdownContent } from "./worker-dropdown-content"

export const ExpandedWorkerCell = React.memo(function ExpandedWorkerCell({
  person,
  delay = 0,
  onPersonClick,
  dataTour,
}: {
  person: PersonNodeProps
  delay?: number
  onPersonClick?: (userId: string) => void
  /** Optional `data-tour` anchor so the guide can spotlight a single teammate. */
  dataTour?: string
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <div
          data-tour={dataTour}
          role="button"
          tabIndex={0}
          className={cn(
            "rounded-lg bg-muted/50 dark:bg-background/30 border border-border/50 dark:border-border/30 flex flex-col h-[110px] outline-none",
            "cursor-pointer hover:border-primary/40 hover:bg-accent/40 transition-colors",
          )}
          style={{ animation: `expandCardIn 0.5s ${APPLE_EASE} ${delay}s both` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
            <span className="text-[11px] font-semibold text-foreground/70 truncate">{person.name}</span>
            {person.tag && (
              <span className={cn(
                "text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                person.tag.variant === "task" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                "bg-purple-500/15 text-purple-600 dark:text-purple-400",
              )}>
                {person.tag.text}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-end pl-3 pb-3">
            <WorkerAvatar
              initials={person.initials}
              color={person.color}
              status={person.status}
              clockedIn={person.clockedIn}
              imageUrl={person.imageUrl}
              hideDot
              className="[&>div:first-child]:!w-[58px] [&>div:first-child]:!h-[58px] [&>div:first-child]:!min-w-[58px] [&>div:first-child]:!min-h-[58px] [&>div:first-child]:!text-xl"
            />
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-80 rounded-2xl p-0 overflow-hidden shadow-2xl border-border/50">
        {isOpen && person.userId && (
          <WorkerDropdownContent person={person} onPersonClick={onPersonClick} onClose={() => setIsOpen(false)} />
        )}
        {isOpen && !person.userId && (
          <div className="p-4 text-center text-sm text-muted-foreground">{t("workspace.noProfileData")}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
