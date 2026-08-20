"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Plus, Trash2, Loader2, Star, Library, GitFork, Globe } from "lucide-react"

import { workflowsApi, type StatusWorkflow } from "@/lib/api"
import { spaceMayOffer } from "@hbcfield/shared/client"
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState("")
  const [picking, setPicking] = useState("")

  const { data: offered = [], isLoading } = useQuery({
    queryKey: ["space-workflows", spaceId],
    queryFn: () => workflowsApi.listForSpace(spaceId),
  })
  const { data: all = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })
  /*
    The shared library — ready-made task types nobody in this organization has
    to design. Picking one COPIES it: the organization gets its own definition
    to edit, and nothing here points back at the library afterwards.
  */
  const { data: templates = [] } = useQuery({
    queryKey: ["workflow-library"],
    queryFn: workflowsApi.library.list,
    staleTime: 5 * 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["space-workflows", spaceId] })
    // A copy from the library is a new org task type, so the org list is stale too.
    queryClient.invalidateQueries({ queryKey: ["workflows"] })
    // The space's own record still carries the legacy default; keep it honest.
    queryClient.invalidateQueries({ queryKey: ["location", spaceId] })
  }

  const attach = useMutation({
    mutationFn: (workflowId: string) => workflowsApi.attachToSpace(spaceId, workflowId),
    onSuccess: () => { notify.success(t("locations.workflows.added", "Task type added")); setAdding(""); refresh() },
    // The server refuses when the space has not enabled a module the workflow's
    // steps need, and says which. Show that rather than a generic failure — it
    // names the switch to turn on.
    onError: (e: Error) => notify.error(e.message || t("locations.workflows.addFailed", "Could not add that task type")),
  })

  const detach = useMutation({
    mutationFn: (workflowId: string) => workflowsApi.detachFromSpace(spaceId, workflowId),
    onSuccess: () => { notify.success(t("locations.workflows.removed", "Task type removed")); refresh() },
    onError: (e: Error) => notify.error(e.message || t("locations.workflows.removeFailed", "Could not remove that task type")),
  })

  /*
    Copy from the library and offer it here in one action, because that is one
    intention. The server does both, so a refusal — the space is missing a
    module the template's steps need — arrives before anything is half-done
    rather than leaving a new task type stranded outside the space it was added
    from.
  */
  const fromLibrary = useMutation({
    mutationFn: (templateId: string) => workflowsApi.library.use(templateId, { spaceId }),
    onSuccess: () => { notify.success(t("locations.workflows.added", "Task type added")); setPicking(""); refresh() },
    onError: (e: Error) => notify.error(e.message || t("locations.workflows.addFailed", "Could not add that task type")),
  })

  /*
    Take this space's own copy of a shared type, so it can diverge here without
    changing it for every other space that offers it.
  */
  const fork = useMutation({
    mutationFn: (workflowId: string) => workflowsApi.forkForSpace(spaceId, workflowId),
    onSuccess: (r) => {
      notify.success(
        t("locations.workflows.forked", { name: r?.name ?? "", defaultValue: '"{{name}}" is now this space\'s own copy — edit it freely.' }),
      )
      refresh()
    },
    onError: (e: Error) => notify.error(e.message || t("locations.workflows.forkFailed", "Could not copy that task type")),
  })

  /* Widen a local type so any space in the organization can offer it. */
  const share = useMutation({
    mutationFn: (workflowId: string) => workflowsApi.shareWithOrganization(workflowId),
    onSuccess: () => { notify.success(t("locations.workflows.shared", "Shared with the organization")); refresh() },
    onError: (e: Error) => notify.error(e.message || t("locations.workflows.shareFailed", "Could not share that task type")),
  })

  const makeDefault = useMutation({
    mutationFn: (workflowId: string) => workflowsApi.setSpaceDefault(spaceId, workflowId),
    onSuccess: () => { notify.success(t("locations.workflows.defaultSet", "Default updated")); refresh() },
    onError: (e: Error) => notify.error(e.message || t("locations.workflows.defaultFailed", "Could not change the default")),
  })

  const offeredIds = new Set(offered.map((w) => w.id))
  /*
    Another space's own task type is not on offer here.

    Filtered with the same rule the server enforces, so the list never shows
    something that would be refused on click — and so "local" means the same
    thing in the interface as it does in the database.
  */
  const addable = all.filter(
    (w: StatusWorkflow) => !offeredIds.has(w.id) && spaceMayOffer(w, spaceId),
  )
  const busy = attach.isPending || detach.isPending || makeDefault.isPending || fromLibrary.isPending || fork.isPending || share.isPending

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {t("locations.workflows.title", "Task types in this space")}
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
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
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
                          ? t("locations.workflows.localHint", "Only this space uses it. Edits stay here.")
                          : t("locations.workflows.sharedHint", "Shared with the organization. Editing it changes it everywhere it is offered.")
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
                      {wf.statuses.map((s) => s.name).join(" → ")}
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
                    title={t("locations.workflows.shareHint", "Let any space in the organization offer this one definition")}
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
                    title={t("locations.workflows.forkHint", "Take this space's own copy so you can change it without affecting other spaces")}
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
                  title={t("locations.workflows.remove", "Remove from this space")}
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
            {t("locations.workflows.libraryHint", "Or start from a ready-made task type. It is copied into your organization, so you can edit it afterwards.")}
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
                      {tpl.statuses.map((st) => st.name).join(" → ")}
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
