"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Plus, Trash2, Loader2, Star, Library, GitFork, Globe } from "lucide-react"

import { workflowsApi, type StatusWorkflow } from "@/lib/api"
import { spaceMayOffer, workflowStatusLabel } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useSpaceWorkflowsSection } from "./use-space-workflows-section"

/**
 * The task types this space offers.
 *
 * A space used to point at exactly one, so every space in an organization ran
 * the same flow or someone maintained near-duplicates at org level. A space
 * chooses its own set now, and one of them is what new tasks inherit.
 *
 * The workflows themselves stay owned by the organization — this decides which
 * are OFFERED here, not what they contain. Editing one edits it everywhere,
 * which is the point: a typo is fixed once.
 */
export function SpaceWorkflowsSection({ spaceId }: { spaceId: string }) {
  const {
    t,
    adding,
    setAdding,
    picking,
    setPicking,
    offered,
    isLoading,
    templates,
    attach,
    detach,
    fromLibrary,
    fork,
    share,
    makeDefault,
    addable,
    busy,
  } = useSpaceWorkflowsSection({ spaceId })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {t("locations.workflows.title", "Task types in this workspace")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("locations.workflows.hint", "New tasks here use the default unless another is chosen.")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading", "Loading…")}
        </div>
      ) : offered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("locations.workflows.none", "No task types yet — tasks here use the standard flow.")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {offered.map((wf) => {
            const isDefault = (wf as StatusWorkflow & { isDefault?: boolean }).isDefault
            // Local to this space, or one the whole organization shares? The
            // difference decides whether editing it here reaches other spaces,
            // so it is on the row rather than a page away.
            const isLocal = wf.ownerSpaceId === spaceId
            return (
              <li key={wf.id} className="flex items-center gap-3 bg-card px-3.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{wf.name}</span>
                    {isDefault && (
                      <span
                        className={"inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 " +
                          "py-0.5 text-[10px] font-medium text-muted-foreground"}>
                        <Check className="size-2.5" />
                        {t("locations.workflows.default", "Default")}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        isLocal
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "bg-muted text-muted-foreground",
                      )}
                      title={
                        isLocal
                          ? t("locations.workflows.localHint", "Only this workspace uses it. Edits stay here.")
                          : t(
                            "locations.workflows.sharedHint",
                            ("Shared with the organization. Editing it changes it everywhere it is " + "offered."))
                      }
                    >
                      {isLocal ? <GitFork className="size-2.5" /> : <Globe className="size-2.5" />}
                      {isLocal
                        ? t("locations.workflows.onlyHere", "Only here")
                        : t("locations.workflows.sharedBadge", "Shared")}
                    </span>
                  </span>
                  {!!wf.statuses?.length && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {wf.statuses.map((s) => workflowStatusLabel(s, t)).join(" → ")}
                    </span>
                  )}
                </span>

                {!isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-xs"
                    disabled={busy}
                    onClick={() => makeDefault.mutate(wf.id)}
                  >
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
                    onClick={() => share.mutate(wf.id)}
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
                      ("Take this space's own copy so you can change it without affecting other " + "spaces"))}
                    onClick={() => fork.mutate(wf.id)}
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
                  onClick={() => detach.mutate(wf.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {addable.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={adding} onValueChange={setAdding} disabled={busy}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder={t("locations.workflows.addPlaceholder", "Add a task type…")} />
            </SelectTrigger>
            <SelectContent>
              {addable.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 shrink-0"
            disabled={!adding || busy}
            onClick={() => attach.mutate(adding)}
          >
            {attach.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Plus className="mr-1.5 size-3.5" />}
            {t("common.add", "Add")}
          </Button>
        </div>
      )}

      {/* Shown whatever the organization already has: the library is where a new
          task type comes from, not a fallback for when the list runs out. */}
      {templates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {t(
              "locations.workflows.libraryHint",
              ("Or start from a ready-made task type. It is copied into your " + "organization, so you can edit it afterwards."))}
          </p>
          <div className="flex items-center gap-2">
            <Select value={picking} onValueChange={setPicking} disabled={busy}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder={t("locations.workflows.libraryPlaceholder", "Choose from the library…")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {tpl.statuses.map((st) => workflowStatusLabel(st, t)).join(" → ")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0"
              disabled={!picking || busy}
              onClick={() => fromLibrary.mutate(picking)}
            >
              {fromLibrary.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Library className="mr-1.5 size-3.5" />}
              {t("locations.workflows.useTemplate", "Use template")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
