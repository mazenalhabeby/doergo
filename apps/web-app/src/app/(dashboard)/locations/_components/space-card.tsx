"use client"

import { keys } from "@/lib/query-keys"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { AVAILABLE_MODULES } from "@hbcfield/shared/client"
import { locationsApi, type CompanyLocation, type StatusWorkflow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state"
import { Chip } from "@/components/page/page-kit"
import { UserAvatar } from "@/components/common/user-avatar"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

function getModuleLabel(key: string): string {
  return AVAILABLE_MODULES.find((m) => m.key === key)?.label || key
}

/** How far a share reaches, as a chip tone (the shared-with-us rows). */
export const LEVEL_TONE: Record<string, "soft" | "accent" | "warn"> = {
  VIEW: "soft",
  CONTRIBUTE: "accent",
  CONTROL: "warn",
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
  onCreateClick: () => void
  isAdmin: boolean
  locked?: boolean
  lockReason?: string
}) {
  const { t } = useTranslation()
  return (
    <SharedEmptyState
      icon={<Icon name="workspaces" size={24} />}
      title={t("locations.empty.title")}
      description={t("locations.empty.description")}
      className="rounded-[22px]"
      action={
        isAdmin && (
          <Button
            size="pill"
            onClick={onCreateClick}
            disabled={locked}
            title={locked ? lockReason : undefined}
            className="gap-2"
          >
            <Icon name="plus" size={16} />
            {t("locations.createSpace")}
          </Button>
        )
      }
    />
  )
}

// ============================================================================
// SPACE CARD — the board's workspace card (docs/design/web-redesign/Company.dc.html)
// ============================================================================

const SMALL_PILL = "h-8 rounded-full px-3.5 text-[13px] font-semibold"

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
  const people = (assignments ?? []).flatMap((a) => (a.user ? [a.user] : [])).slice(0, 3)
  const enabledModules = space.enabledModules || []
  const workflow = workflows.find((w) => w.id === space.workflowId) || workflows.find((w) => w.isDefault)
  const statusCount = workflow?.statuses?.length || 0
  const [first, ...rest] = space.name.trim().split(/\s+/)

  return (
    <div
      data-tour={index === 0 ? "spaces-card" : undefined}
      className={cn(
        "relative flex flex-col gap-3.5 rounded-[22px] border border-border bg-card p-[18px] shadow-shell",
        !space.isActive && "opacity-70",
      )}
    >
      {/* Head: the workspace's mark, its name and address. */}
      <div className="flex items-start gap-3">
        <UserAvatar
          soft
          seed={space.id}
          firstName={first}
          lastName={rest.join(" ")}
          className="size-11 rounded-[14px] text-sm font-bold"
          title={space.name}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-foreground">{space.name}</h3>
          {space.address && <p className="truncate text-[12.5px] text-muted-foreground">{space.address}</p>}
        </div>
      </div>

      {/* Tags: kind, the default, archived. */}
      <div className="flex flex-wrap gap-1.5">
        {/* Ownership kind — tag the non-default kinds (COMPANY is implicit). */}
        {space.kind === "CUSTOMER" && <Chip>{t("locations.form.kindCustomer", "Customer company")}</Chip>}
        {space.kind === "PROJECT" && <Chip>{t("locations.form.kindProject", "My project")}</Chip>}
        {/*
          Which workspace catches work belonging to no particular one.

          On the LIST, not only inside the space: it is a property of the
          ORGANIZATION — exactly one space has it — and a fact about the set
          is unreadable when it is only visible one card at a time. It is
          also what makes a space undeletable, so seeing it here explains a
          refusal before somebody meets it.
        */}
        {space.isDefault && (
          <Chip className="bg-foreground text-background">{t("locations.default.badge", "Default")}</Chip>
        )}
        {space.isActive ? (
          <Chip tone="accent" dot>
            {t("common.active")}
          </Chip>
        ) : (
          <Chip tone="warn">{t("locations.archived", "Archived")}</Chip>
        )}
      </div>

      {/* People here. */}
      {memberCount > 0 && (
        <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <div className="flex">
            {people.map((p) => (
              <UserAvatar
                key={p.id}
                soft
                ring
                seed={p.id}
                firstName={p.firstName}
                lastName={p.lastName}
                avatarUrl={p.avatarUrl}
                className="-ml-[7px] size-7 text-[10px] ring-2 first:ml-0"
              />
            ))}
          </div>
          <span className="font-medium text-foreground">{t("locations.memberCount", { count: memberCount })}</span>
        </div>
      )}

      {/* Workflow. */}
      {workflow && (
        <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <span>{t("locations.workflowPrefix").trim()}</span>
          <span className="truncate font-medium text-foreground">
            {workflow.name}
            {statusCount > 0 ? t("locations.statusCountSuffix", { count: statusCount }) : ""}
          </span>
        </div>
      )}

      {/* Modules switched on here. */}
      {enabledModules.length > 0 && (
        <div className="flex flex-wrap gap-[5px]">
          {enabledModules.map((mod) => (
            <span
              key={mod}
              className="rounded-lg border border-border px-2 py-[3px] text-[11.5px] text-muted-foreground"
            >
              {getModuleLabel(mod)}
            </span>
          ))}
        </div>
      )}

      {/* Actions. */}
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        {space.isActive && (
          <>
            {/* Offered only to somebody who may actually use it. It used to be
                shown to everyone and landed them on a permission wall — the
                page refused correctly, but the button had already promised. */}
            {canConfigure && (
              <Button
                data-tour={index === 0 ? "spaces-card-configure" : undefined}
                variant="outline"
                className={SMALL_PILL}
                onClick={onOpenSettings}
              >
                {t("locations.configure")}
              </Button>
            )}
            <Button
              data-tour={index === 0 ? "spaces-card-viewtasks" : undefined}
              variant="ghost"
              className={SMALL_PILL}
              onClick={onViewTasks}
            >
              {t("locations.viewTasks")}
            </Button>
          </>
        )}
        {!space.isActive && isAdmin && (
          <Button variant="outline" className={SMALL_PILL} onClick={onReactivate}>
            {t("locations.restoreAction", "Restore")}
          </Button>
        )}
        <span className="flex-1" />
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-tour={index === 0 ? "spaces-card-actions" : undefined}
                variant="ghost"
                size="icon"
                className="size-[34px] rounded-full"
                aria-label={t("common.more")}
              >
                <Icon name="moreDots" size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canConfigure && (
                <DropdownMenuItem onClick={onOpenSettings}>{t("locations.spaceSettings")}</DropdownMenuItem>
              )}
              {space.isActive ? (
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  {t("locations.archiveAction", "Archive")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onReactivate}>{t("locations.restoreAction", "Restore")}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
})
