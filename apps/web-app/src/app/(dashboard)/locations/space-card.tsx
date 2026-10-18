"use client"

import { keys } from "@/lib/query-keys"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import {
  Plus,
  MoreHorizontal,
  Users,
  Settings2,
  ToggleRight,
  ToggleLeft,
  Building2,
  ChevronRight,
  SlidersHorizontal,
  Handshake,
  Briefcase,
  Inbox,
} from "lucide-react"
import { AVAILABLE_MODULES } from "@hbcfield/shared/client"
import { locationsApi, type CompanyLocation, type StatusWorkflow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Module color mapping for pills
export const MODULE_COLORS: Record<string, string> = {
  time_tracking: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  sprints: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  story_points: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  epics: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  phases: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  custom_fields: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

export function getModuleLabel(key: string): string {
  return AVAILABLE_MODULES.find((m) => m.key === key)?.label || key
}

// ============================================================================
// EMPTY STATE
// ============================================================================

/*
  The empty state offers the same action as the header, so it obeys the same
  rule. A control disabled in one place and live in another is worse than one
  that is live everywhere: it looks like a bug rather than a policy.
*/
export function EmptyState({
  onCreateClick,
  isAdmin,
  locked,
  lockReason,
}: {
  onCreateClick: () => void;
  isAdmin: boolean;
  locked?: boolean;
  lockReason?: string;
}) {
  const { t } = useTranslation()
  return (
    <SharedEmptyState
      icon={Building2}
      title={t("locations.empty.title")}
      description={t("locations.empty.description")}
      action={isAdmin && (
        <Button onClick={onCreateClick} disabled={locked} title={locked ? lockReason : undefined} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("locations.createSpace")}
        </Button>
      )}
    />
  )
}

// ============================================================================
// SPACE CARD
// ============================================================================

export const SpaceCard = memo(function SpaceCard({
  space,
  workflows,
  isAdmin,
  index,
  onDelete,
  onReactivate,
  onViewTasks,
  onOpenSettings,
  canConfigure,
}: {
  space: CompanyLocation
  workflows: StatusWorkflow[]
  isAdmin: boolean
  index: number
  onDelete: () => void
  onReactivate: () => void
  onViewTasks: () => void
  onOpenSettings: () => void
  /** May this member configure THIS space — see canManageSpace. */
  canConfigure: boolean
}) {
  const { t } = useTranslation()
  const afterFirstLoad = useAfterFirstLoad(1) // the member count waits for the first paint (CLAUDE.md §15)
  const { data: assignments } = useQuery({
    queryKey: keys.locations.roster(space.id),
    queryFn: () => locationsApi.getAssignedMembers(space.id),
    enabled: space.isActive && afterFirstLoad,
  })

  const memberCount = assignments?.length || 0
  const enabledModules = space.enabledModules || []
  const workflow = workflows.find((w) => w.id === space.workflowId) || workflows.find((w) => w.isDefault)
  const statusCount = workflow?.statuses?.length || 0

  return (
    <div
      data-tour={index === 0 ? "spaces-card" : undefined}
      className={`rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md ${
        !space.isActive ? "opacity-60" : ""
      }`}
      style={{ animationDelay: `${index * 50}ms`, animation: "fadeInUp 0.3s ease-out forwards", opacity: 0 }}
    >
      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top: Name + Status + Member count */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-base font-semibold text-foreground truncate">{space.name}</h3>
            <Badge
              variant="outline"
              className={`text-xs font-medium ${
                space.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-border text-muted-foreground"
              }`}
            >
              {space.isActive ? t("common.active") : t("locations.archived", "Archived")}
            </Badge>
            {/*
              Which workspace catches work belonging to no particular one.

              On the LIST, not only inside the space: it is a property of the
              ORGANIZATION — exactly one space has it — and a fact about the set
              is unreadable when it is only visible one card at a time. It is
              also what makes a space undeletable, so seeing it here explains a
              refusal before somebody meets it.
            */}
            {space.isDefault && (
              <Badge variant="outline" className="gap-1 text-xs font-medium border-primary/30 bg-primary/10 text-primary">
                <Inbox className="h-3 w-3" />
                {t("locations.default.badge", "Default")}
              </Badge>
            )}
            {/* Ownership kind — badge the non-default kinds (COMPANY is implicit). */}
            {space.kind === "CUSTOMER" && (
              <Badge
                variant="outline"
                className={"gap-1 text-xs font-medium border-amber-200 bg-amber-50 text-amber-700 " +
                  "dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"}>
                <Handshake className="h-3 w-3" />
                {t("locations.form.kindCustomer", "Customer company")}
              </Badge>
            )}
            {space.kind === "PROJECT" && (
              <Badge
                variant="outline"
                className={"gap-1 text-xs font-medium border-blue-200 bg-blue-50 text-blue-700 " +
                  "dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"}>
                <Briefcase className="h-3 w-3" />
                {t("locations.form.kindProject", "My project")}
              </Badge>
            )}
            {memberCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {t("locations.memberCount", { count: memberCount })}
              </span>
            )}
          </div>

          {/* Address */}
          {space.address && (
            <p className="text-sm text-muted-foreground mt-1 truncate">{space.address}</p>
          )}

          {/* Modules row */}
          {enabledModules.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {enabledModules.map((mod) => (
                <span
                  key={mod}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                    MODULE_COLORS[mod] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {getModuleLabel(mod)}
                </span>
              ))}
            </div>
          )}

          {/* Workflow info */}
          {workflow && (
            <p className="text-xs text-muted-foreground mt-2">
              {t(
                "locations.workflowPrefix")}{workflow.name}{statusCount > 0 ? t("locations.statusCountSuffix", { count: statusCount }) : ""}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {space.isActive && (
            <>
              {/* Offered only to somebody who may actually use it. It used to be
                  shown to everyone and landed them on a permission wall — the
                  page refused correctly, but the button had already promised. */}
              {canConfigure && (
            <Button
              data-tour={index === 0 ? "spaces-card-configure" : undefined}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs rounded-lg"
              onClick={onOpenSettings}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t("locations.configure")}
            </Button>
              )}
              <Button
                data-tour={index === 0 ? "spaces-card-viewtasks" : undefined}
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                onClick={onViewTasks}
              >
                {t("locations.viewTasks")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-tour={index === 0 ? "spaces-card-actions" : undefined} variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canConfigure && (
                  <DropdownMenuItem onClick={onOpenSettings}>
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    {t("locations.spaceSettings")}
                  </DropdownMenuItem>
                )}
                {space.isActive ? (
                  <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                    <ToggleLeft className="mr-2 h-4 w-4" />
                    {t("locations.archiveAction", "Archive")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onReactivate} className="text-emerald-600 focus:text-emerald-600">
                    <ToggleRight className="mr-2 h-4 w-4" />
                    {t("locations.restoreAction", "Restore")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// SHARED WITH US — cross-org invites + active shared spaces (guest side)
// ============================================================================

export const LEVEL_BADGE: Record<string, string> = {
  VIEW: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CONTRIBUTE: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  CONTROL: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
}
