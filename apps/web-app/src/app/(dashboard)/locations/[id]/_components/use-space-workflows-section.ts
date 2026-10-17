"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { workflowsApi, type StatusWorkflow } from "@/lib/api"
import { spaceMayOffer } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"

/** SpaceWorkflowsSection's state and handlers — everything before its markup, moved here unchanged. */
export function useSpaceWorkflowsSection({ spaceId }: Pick<{ spaceId: string }, 'spaceId'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState("")
  const [picking, setPicking] = useState("")

  const { data: offered = [], isLoading } = useQuery({
    queryKey: keys.spaces.workflows(spaceId),
    queryFn: () => workflowsApi.listForSpace(spaceId),
  })
  const { data: all = [] } = useQuery({
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
  })
  /*
    The shared library — ready-made task types nobody in this organization has
    to design. Picking one COPIES it: the organization gets its own definition
    to edit, and nothing here points back at the library afterwards.
  */
  const { data: templates = [] } = useQuery({
    queryKey: keys.spaces.workflowLibrary(),
    queryFn: workflowsApi.library.list,
    staleTime: 5 * 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: keys.spaces.workflows(spaceId) })
    // A copy from the library is a new org task type, so the org list is stale too.
    queryClient.invalidateQueries({ queryKey: keys.workflows.lists() })
    // The space's own record still carries the legacy default; keep it honest.
    queryClient.invalidateQueries({ queryKey: keys.locations.detail(spaceId) })
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
        t(
          "locations.workflows.forked",
          { name: r?.name ?? "", defaultValue: '"{{name}}" is now this space\'s own copy — edit it freely.' }),
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

  return {
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
  }
}
