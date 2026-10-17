"use client"

import { Building2, Share2, Plus, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BackToSpaces } from "@/components/space-page"
import { Badge } from "@/components/ui/badge"
import { LEVEL_STYLES } from "./shared-space-view-page-helpers"
import type { SharedSpaceViewPageState } from "./use-shared-space-view-page"

/** Part of SharedSpaceViewPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function SharedSpaceViewPageGuest2({ vm }: { vm: SharedSpaceViewPageState }) {
  const {
    share,
    t,
    canManageMembers,
    setAddWorkerOpen,
    canCreate,
    setCreateOpen,
    setRequestOpen,
  } = vm
  if ((!share)) return null
  return (
    <div className="mb-6">
      <BackToSpaces />
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight truncate">{share.spaceName}</h1>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1 text-xs font-medium border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                <Share2 className="h-3 w-3" />
                {t("spaceSharing.guest.sharedFrom", { org: share.ownerOrgName })}
              </Badge>
              <Badge variant="outline" className={cn("text-xs font-medium", LEVEL_STYLES[share.level])}>
                {t(`spaceSharing.levels.${share.level}.label`)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManageMembers && (
            <Button variant="outline" onClick={() => setAddWorkerOpen(true)} className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              {t("spaceSharing.guest.addWorker", "Add worker")}
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("spaceSharing.guest.newTask", "New task")}
            </Button>
          )}
          {share.allowRequests && (
            <Button variant={canCreate ? "outline" : "default"} onClick={() => setRequestOpen(true)} className="gap-1.5">
              {!canCreate && <Plus className="h-4 w-4" />}
              {t("spaceSharing.guest.requestMore")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
