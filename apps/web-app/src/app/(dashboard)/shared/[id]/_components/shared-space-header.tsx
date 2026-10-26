"use client"

import { Plus, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BackToSpaces } from "@/components/spaces/space-page"
import { Chip, PageHeader } from "@/components/page/page-kit"
import { useTranslation } from "react-i18next"
import type { SharedSpace } from "../_hooks/use-shared-space-view-page"

/** How far the share reaches, as a chip tone. */
const LEVEL_TONE: Record<string, "soft" | "accent" | "warn"> = {
  VIEW: "soft",
  CONTRIBUTE: "accent",
  CONTROL: "warn",
}

type SharedSpaceHeaderProps = {
  share: SharedSpace
  canManageMembers: boolean
  canCreate: boolean
  onAddWorker: () => void
  onCreateTask: () => void
  onRequestMore: () => void
}

/** The workspace's name, who shared it at which level, and the guest's actions. */
export function SharedSpaceHeader({
  share,
  canManageMembers,
  canCreate,
  onAddWorker,
  onCreateTask,
  onRequestMore,
}: SharedSpaceHeaderProps) {
  const { t } = useTranslation()
  return (
    <>
      <div className="mb-3">
        <BackToSpaces />
      </div>
      <PageHeader
        title={<span className="block truncate">{share.spaceName}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone="accent">{t("spaceSharing.guest.sharedFrom", { org: share.ownerOrgName })}</Chip>
            <Chip tone={LEVEL_TONE[share.level] ?? "soft"}>{t(`spaceSharing.levels.${share.level}.label`)}</Chip>
          </span>
        }
        actions={
          <>
            {canManageMembers && (
              <Button variant="outline" size="pill" onClick={onAddWorker}>
                <UserPlus />
                {t("spaceSharing.guest.addWorker", "Add worker")}
              </Button>
            )}
            {canCreate && (
              <Button size="pillLg" onClick={onCreateTask}>
                <Plus />
                {t("spaceSharing.guest.newTask", "New task")}
              </Button>
            )}
            {share.allowRequests && (
              <Button
                variant={canCreate ? "outline" : "default"}
                size={canCreate ? "pill" : "pillLg"}
                onClick={onRequestMore}
              >
                {!canCreate && <Plus />}
                {t("spaceSharing.guest.requestMore")}
              </Button>
            )}
          </>
        }
      />
    </>
  )
}
