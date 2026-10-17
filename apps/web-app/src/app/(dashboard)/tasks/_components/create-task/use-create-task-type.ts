"use client"

import { keys } from "@/lib/query-keys"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { workflowsApi } from "@/lib/api"
import { useOrgWorkflow } from "@/hooks/use-org-workflow"
import { useSpaceModules, type useSpaceModulesQuery } from "@/hooks/use-space-modules"
import type { useAuth } from "@/contexts/auth-context"
import type { useCreateTaskLists } from "./use-create-task-lists"

/*
  The task type parts of useCreateTaskForm, moved here unchanged. The form calls each hook at
  the point its code used to be, so the same hooks run in the same order.
*/

export function useCreateTaskType({
  open,
  spaceId,
  orgHasModule,
}: {
  open: boolean
  spaceId: string
  orgHasModule: ReturnType<typeof useAuth>["hasModule"]
}) {
  // ── Task Type (workflow) — "inherit" = use the space's default; otherwise the
  // task carries its own flow so one space can hold tasks of different types. ──
  const [workflowId, setWorkflowId] = useState<string>("inherit")
  const { workflows: orgWorkflows } = useOrgWorkflow()

  /*
    The task types THIS space offers — not every type the organization owns.

    A space chooses its own set now, and the server refuses a type the space
    does not offer, so listing them all would present choices that fail on
    submit. Falls back to the organization's list when no space is picked yet,
    or when a space has no offerings of its own (it still runs on the legacy
    single default).
  */
  const { data: spaceWorkflows } = useQuery({
    queryKey: keys.spaces.workflows(spaceId),
    queryFn: () => workflowsApi.listForSpace(spaceId),
    enabled: open && !!spaceId && spaceId !== "none",
  })
  const workflows: { id: string; name: string }[] = spaceWorkflows?.length ? spaceWorkflows : orgWorkflows

  // ── Space-aware module resolution ──
  const { hasModule: spaceHasModule } = useSpaceModules(spaceId !== "none" ? spaceId : null)
  const hasModule = spaceId !== "none" ? spaceHasModule : orgHasModule
  /*
    ⚠️ This asked `hasPlanFeature` with a module key, and custom fields are a
    MODULE, not an Option.

    `hasPlanFeature` opens with `if (!isAddOn(feature)) return false`, so it
    answered NO for every organization — including the ones with the module
    switched on and being billed €6 a workspace for it. Custom fields never
    appeared in this dialog for anybody, and nothing said why.

    `hasModule` is the right question, and it is the per-SPACE one when a
    workspace is chosen (line above) — which is how the module is sold.
  */
  const canCustomFields = hasModule("custom_fields")

  return { workflowId, setWorkflowId, orgWorkflows, workflows, hasModule, canCustomFields }
}

export function useSpaceTaskType({
  open,
  spaceId,
  spaceModules,
  workflows,
  orgWorkflows,
  workflowId,
  canCustomFields,
  activeCustomFields,
}: {
  open: boolean
  spaceId: string
  spaceModules: ReturnType<typeof useSpaceModulesQuery>["data"]
  workflows: { id: string; name: string }[]
  orgWorkflows: ReturnType<typeof useOrgWorkflow>["workflows"]
  workflowId: string
  canCustomFields: boolean
  activeCustomFields: ReturnType<typeof useCreateTaskLists>["activeCustomFields"]
}) {
  const spaceWorkflowId = spaceId !== "none" ? (spaceModules?.workflowId ?? null) : null
  /*
    The workspace's own flow by NAME, for the "Workspace default (…)" choice.
    ⚠️ It is not always among the types offered (a workspace may offer others
    and keep a legacy default) — the label read "Workspace default ()". Looked
    up in what is loaded first, fetched only when it is missing.
  */
  const knownSpaceWorkflowName = spaceWorkflowId
    ? ((workflows.find((w) => w.id === spaceWorkflowId) ?? orgWorkflows?.find((w) => w.id === spaceWorkflowId))?.name ??
      null)
    : null
  const { data: fetchedSpaceWorkflow } = useQuery({
    queryKey: keys.spaces.workflow(spaceWorkflowId),
    queryFn: () => workflowsApi.getById(spaceWorkflowId!),
    enabled: open && !!spaceWorkflowId && !knownSpaceWorkflowName,
    staleTime: 120000,
    retry: 1,
  })
  const spaceWorkflowName = knownSpaceWorkflowName ?? fetchedSpaceWorkflow?.name ?? null
  // The task's effective type: an explicit pick, else inherited from the space.
  const effectiveWorkflowId = workflowId !== "inherit" ? workflowId : spaceWorkflowId

  // Fields applicable to the chosen Task Type: globals always, plus that
  // workflow's own fields. No type → globals only.
  const applicableCustomFields = useMemo(
    // Custom Fields is a Professional+ feature — don't render the inputs below tier
    // (the backend also 402s the write; this keeps a downgraded org from seeing them).
    () =>
      canCustomFields
        ? activeCustomFields.filter((f) => f.workflowId == null || f.workflowId === effectiveWorkflowId)
        : [],
    [activeCustomFields, effectiveWorkflowId, canCustomFields],
  )

  return { spaceWorkflowId, spaceWorkflowName, applicableCustomFields }
}
