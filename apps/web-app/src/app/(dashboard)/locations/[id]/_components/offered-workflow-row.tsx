"use client"

import { useTranslation } from "react-i18next"
import { Check, Trash2, Star, GitFork, Globe } from "lucide-react"
import { type StatusWorkflow } from "@/lib/api"
import { workflowStatusLabel } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * One task type this workspace offers: its steps, whether it is the default, and whether it is this
 * workspace's own copy or shared with the organization — with the actions that fit.
 */
export function OfferedWorkflowRow({
  wf,
  spaceId,
  busy,
  onMakeDefault,
  onShare,
  onFork,
  onRemove,
}: {
  wf: StatusWorkflow
  spaceId: string
  /** Any change to this workspace's task types is running. */
  busy: boolean
  onMakeDefault: () => void
  onShare: () => void
  onFork: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const isDefault = (wf as StatusWorkflow & { isDefault?: boolean }).isDefault
  // Local to this space, or one the whole organization shares? The
  // difference decides whether editing it here reaches other spaces,
  // so it is on the row rather than a page away.
  const isLocal = wf.ownerSpaceId === spaceId
  return (
    <li className="flex items-center gap-3 bg-card px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{wf.name}</span>
          {isDefault && (
            <span
              className={
                "inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 " +
                "py-0.5 text-[10px] font-medium text-muted-foreground"
              }
            >
              <Check className="size-2.5" />
              {t("locations.workflows.default", "Default")}
            </span>
          )}
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              isLocal ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground",
            )}
            title={
              isLocal
                ? t("locations.workflows.localHint", "Only this workspace uses it. Edits stay here.")
                : t(
                    "locations.workflows.sharedHint",
                    "Shared with the organization. Editing it changes it everywhere it is " + "offered.",
                  )
            }
          >
            {isLocal ? <GitFork className="size-2.5" /> : <Globe className="size-2.5" />}
            {isLocal ? t("locations.workflows.onlyHere", "Only here") : t("locations.workflows.sharedBadge", "Shared")}
          </span>
        </span>
        {!!wf.statuses?.length && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {wf.statuses.map((s) => workflowStatusLabel(s, t)).join(" → ")}
          </span>
        )}
      </span>

      {!isDefault && (
        <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" disabled={busy} onClick={onMakeDefault}>
          <Star className="mr-1 size-3" />
          {t("locations.workflows.makeDefault", "Make default")}
        </Button>
      )}
      {isLocal ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          disabled={busy}
          title={t("locations.workflows.shareHint", "Let any workspace in the organization offer this one definition")}
          onClick={onShare}
        >
          <Globe className="mr-1 size-3" />
          {t("locations.workflows.share", "Share")}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          disabled={busy}
          title={t(
            "locations.workflows.forkHint",
            "Take this space's own copy so you can change it without affecting other " + "spaces",
          )}
          onClick={onFork}
        >
          <GitFork className="mr-1 size-3" />
          {t("locations.workflows.fork", "Copy here")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-red-600")}
        disabled={busy}
        title={t("locations.workflows.remove", "Remove from this workspace")}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  )
}
