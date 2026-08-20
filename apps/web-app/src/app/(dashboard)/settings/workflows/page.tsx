"use client"

import { PlanGate } from "@/components/plan-gate"
import { useState, useCallback, useEffect, memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Star,
  Loader2,
  GitBranch,
  ArrowRight,
  Circle,
  AlertCircle,
  Check,
  GitFork,
  Upload,
} from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  workflowsApi,
  type StatusWorkflow,
  type WorkflowStatus,
} from "@/lib/api"
import { workflowAdvice, validateWorkflow } from "@hbcfield/shared/client"
import { CustomFieldsManager } from "@/components/custom-fields-manager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#22c55e",
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6",
  "#64748b", "#0ea5e9",
]

// Execution widgets that can be active at a step.
const ALL_CAPABILITIES: { key: string; labelKey: string }[] = [
  { key: "gps", labelKey: "workflows.page.capabilityLabels.gps" },
  { key: "timer", labelKey: "workflows.page.capabilityLabels.timer" },
  { key: "checklist", labelKey: "workflows.page.capabilityLabels.checklist" },
  { key: "photos", labelKey: "workflows.page.capabilityLabels.photos" },
  { key: "signature", labelKey: "workflows.page.capabilityLabels.signature" },
  { key: "report", labelKey: "workflows.page.capabilityLabels.report" },
  { key: "form", labelKey: "workflows.page.capabilityLabels.form" },
]

// ============================================================================
// Status Badge Component
// ============================================================================

const StatusDot = memo(function StatusDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  )
})

// ============================================================================
// Status Item Row
// ============================================================================

const StatusRow = memo(function StatusRow({
  status,
  workflowId,
  allStatuses,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  reorderDisabled,
}: {
  status: WorkflowStatus
  workflowId: string
  allStatuses: WorkflowStatus[]
  onEdit: (s: WorkflowStatus) => void
  onDelete: (s: WorkflowStatus) => void
  onMoveUp: (s: WorkflowStatus) => void
  onMoveDown: (s: WorkflowStatus) => void
  isFirst: boolean
  isLast: boolean
  reorderDisabled: boolean
}) {
  const { t } = useTranslation()
  const transitionNames = status.transitions
    .map((key) => allStatuses.find((s) => s.key === key)?.name)
    .filter(Boolean)

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-muted/50 transition-colors group">
      <StatusDot color={status.color} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{status.name}</span>
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {status.key}
          </span>
          {status.isFinal && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {t("workflows.final")}
            </span>
          )}
          {status.isCanceled && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {t("workflows.canceled")}
            </span>
          )}
          {status.wipLimit != null && status.wipLimit > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {t("workflows.page.wipBadge", { count: status.wipLimit })}
            </span>
          )}
        </div>
        {transitionNames.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {transitionNames.join(", ")}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex flex-col">
          <button
            type="button"
            aria-label={t("workflows.page.moveUp")}
            disabled={isFirst || reorderDisabled}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default"
            onClick={() => onMoveUp(status)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("workflows.page.moveDown")}
            disabled={isLast || reorderDisabled}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default"
            onClick={() => onMoveDown(status)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onEdit(status)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => onDelete(status)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
})

// ============================================================================
// Workflow Card
// ============================================================================

const WorkflowCard = memo(function WorkflowCard({
  workflow,
  onSetDefault,
  onDelete,
  onAddStatus,
  onEditStatus,
  onDeleteStatus,
}: {
  workflow: StatusWorkflow
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
  onAddStatus: (workflowId: string) => void
  onEditStatus: (workflowId: string, status: WorkflowStatus) => void
  onDeleteStatus: (workflowId: string, status: WorkflowStatus) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()
  const statuses = workflow.statuses || []
  const sorted = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses],
  )

  // Reorder all statuses in ONE request, with an optimistic cache update so the
  // row moves instantly and the server round-trip is invisible.
  const reorderMutation = useMutation({
    mutationFn: (statusIds: string[]) =>
      workflowsApi.reorderStatuses(workflow.id, statusIds),
    onMutate: async (statusIds) => {
      await queryClient.cancelQueries({ queryKey: ["workflows"] })
      const prev = queryClient.getQueryData<StatusWorkflow[]>(["workflows"])
      queryClient.setQueryData<StatusWorkflow[]>(["workflows"], (old) =>
        old?.map((w) =>
          w.id === workflow.id
            ? {
                ...w,
                statuses: statusIds.map((id, i) => {
                  const s = (w.statuses || []).find((x) => x.id === id)!
                  return { ...s, position: i }
                }),
              }
            : w,
        ),
      )
      return { prev }
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["workflows"], ctx.prev)
      notify.error(e.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  })

  const problems = useMemo(() => validateWorkflow(sorted), [sorted])
  const advice = useMemo(() => workflowAdvice(sorted), [sorted])

  const submitMutation = useMutation({
    mutationFn: () => workflowsApi.submitToLibrary(workflow.id),
    onSuccess: (r) =>
      notify.success(
        r?.resubmitted
          ? t("workflows.page.toast.resubmitted", "Updated — it is waiting to be reviewed.")
          : t("workflows.page.toast.submitted", "Sent for review. It reaches other organizations once approved."),
      ),
    onError: (e: Error) => notify.error(e.message),
  })

  const move = useCallback(
    (statusId: string, dir: -1 | 1) => {
      const index = sorted.findIndex((s) => s.id === statusId)
      const target = index + dir
      if (index < 0 || target < 0 || target >= sorted.length) return
      const ids = sorted.map((s) => s.id)
      const tmp = ids[index]!
      ids[index] = ids[target]!
      ids[target] = tmp
      reorderMutation.mutate(ids)
    },
    [sorted, reorderMutation],
  )

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      {/* Card Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
          <GitBranch className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{workflow.name}</h3>
            {workflow.isDefault && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Star className="h-3 w-3" />
                {t("workflows.page.default")}
              </span>
            )}
            {/* A task type belonging to one space is shown here rather than
                hidden, so nobody hunts for one they know they created. */}
            {workflow.ownerSpace && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <GitFork className="h-3 w-3" />
                {workflow.ownerSpace.name}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {workflow.ownerSpace
              ? t("workflows.page.localTo", {
                  space: workflow.ownerSpace.name,
                  count: statuses.length,
                  defaultValue: "{{count}} steps · only {{space}} uses it",
                })
              : t("workflows.page.statusCount", { count: statuses.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Offering it to the library SUBMITS it; a curator reads it before
              any other organization is offered it. The wording has to say so,
              or the click reads as "publish". */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={submitMutation.isPending}
            title={t("workflows.page.submitHint", "Offer this flow to other organizations. It is reviewed first.")}
            onClick={(e) => {
              e.stopPropagation()
              submitMutation.mutate()
            }}
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            {t("workflows.page.submitToLibrary", "Offer to library")}
          </Button>
          {!workflow.isDefault && !workflow.ownerSpace && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onSetDefault(workflow.id)
              }}
            >
              {t("workflows.page.setDefault")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(workflow.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded: Status List */}
      {expanded && (
        <div className="border-t border-border">
          {/*
            What is wrong, then what could be better.

            Problems refuse the flow when it is used — a step nothing reaches, a
            task with no way out — so they are stated plainly. Advice never
            blocks anything; it is what practised flows have that this one does
            not, shown while there is still someone here to act on it.
          */}
          {(problems.length > 0 || advice.length > 0) && (
            <div className="border-b border-border px-4 py-3 space-y-1.5">
              {problems.map((p, i) => (
                <p key={`p${i}`} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {p.message}
                </p>
              ))}
              {advice.map((a) => (
                <p key={a.code} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {a.message}
                </p>
              ))}
            </div>
          )}
          <div className="p-4 space-y-0.5">
            {statuses.length === 0 ? (
              <div className="text-center py-6">
                <Circle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t("workflows.page.noStatuses")}</p>
              </div>
            ) : (
              sorted.map((status, index) => (
                <StatusRow
                  key={status.id}
                  status={status}
                  workflowId={workflow.id}
                  allStatuses={sorted}
                  onEdit={(s) => onEditStatus(workflow.id, s)}
                  onDelete={(s) => onDeleteStatus(workflow.id, s)}
                  onMoveUp={(s) => move(s.id, -1)}
                  onMoveDown={(s) => move(s.id, 1)}
                  isFirst={index === 0}
                  isLast={index === sorted.length - 1}
                  reorderDisabled={reorderMutation.isPending}
                />
              ))
            )}
          </div>
          <div className="px-4 pb-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-xl border-dashed"
              onClick={() => onAddStatus(workflow.id)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("workflows.builder.addStatus")}
            </Button>
          </div>

          {/* Custom fields for this Task Type */}
          <div className="px-4 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t("workflows.page.fields")}
            </p>
            <CustomFieldsManager workflowId={workflow.id} />
          </div>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Create Workflow Dialog
// ============================================================================

function CreateWorkflowDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  // null = "Blank" (start with no statuses); otherwise a library template id.
  const [templateId, setTemplateId] = useState<string | null>(null)

  /*
    The library comes from the server, not from a constant in the bundle.

    It is platform-curated, so a new template reaches every tenant without a web
    deploy — and, more importantly, the statuses of a template are read
    server-side when it is used. The browser sends an id; it does not get to say
    what the resulting state machine looks like.
  */
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["workflow-library"],
    queryFn: workflowsApi.library.list,
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const selectedTemplate = templates.find((tpl) => tpl.id === templateId) ?? null

  // Preselect the first template once the library arrives, without overriding a
  // choice already made — including the deliberate choice of "Blank".
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!touched && templateId === null && templates.length > 0) setTemplateId(templates[0]!.id)
  }, [templates, templateId, touched])

  const reset = () => {
    setName("")
    setTemplateId(null)
    setTouched(false)
  }

  const mutation = useMutation({
    mutationFn: () =>
      selectedTemplate
        ? workflowsApi.library.use(selectedTemplate.id, { name: name.trim() || undefined })
        : workflowsApi.create({ name: name.trim() }),
    onSuccess: () => {
      notify.success(t("workflows.page.toast.taskTypeCreated"))
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      reset()
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // A name is required only when starting blank; templates supply their own.
  const canSubmit = (!!selectedTemplate || name.trim().length > 0) && !mutation.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workflows.page.createTaskType")}</DialogTitle>
          <DialogDescription>
            {t("workflows.page.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("workflows.page.startFrom")}</Label>
            <div className="grid gap-2 max-h-[280px] overflow-y-auto pr-1">
              {loadingTemplates && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("workflows.page.loadingLibrary")}
                </div>
              )}
              {templates.map((tpl) => {
                const active = templateId === tpl.id
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setTouched(true)
                      setTemplateId(tpl.id)
                    }}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        active ? "border-blue-600 bg-blue-600" : "border-muted-foreground/40"
                      }`}
                    >
                      {active && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                        <span className="text-xs text-muted-foreground/70">
                          {t("workflows.page.steps", { count: tpl.statuses.length })}
                        </span>
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground">{tpl.description}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {tpl.statuses.map((s, i) => (
                          <span key={s.key} className="flex items-center gap-1">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            <span className="text-[10px] text-muted-foreground">{s.name}</span>
                            {i < tpl.statuses.length - 1 && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                )
              })}
              {/* Blank option */}
              <button
                type="button"
                onClick={() => {
                  setTouched(true)
                  setTemplateId(null)
                }}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  templateId === null
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    templateId === null ? "border-blue-600 bg-blue-600" : "border-muted-foreground/40"
                  }`}
                >
                  {templateId === null && <Check className="h-3 w-3 text-white" />}
                </div>
                <div>
                  <span className="text-sm font-medium text-foreground">{t("workflows.page.blank")}</span>
                  <p className="text-xs text-muted-foreground">
                    {t("workflows.page.blankHint")}
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("workflows.name")} {selectedTemplate && <span className="text-muted-foreground/70">{t("workflows.page.optionalParen")}</span>}</Label>
            <Input
              placeholder={selectedTemplate ? selectedTemplate.name : t("workflows.page.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && mutation.mutate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Add/Edit Status Dialog
// ============================================================================

function StatusDialog({
  open,
  onOpenChange,
  workflowId,
  existingStatus,
  allStatuses,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  existingStatus: WorkflowStatus | null
  allStatuses: WorkflowStatus[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = !!existingStatus

  const [name, setName] = useState(existingStatus?.name || "")
  const [key, setKey] = useState(existingStatus?.key || "")
  const [color, setColor] = useState(existingStatus?.color || STATUS_COLORS[0]!)
  const [isFinal, setIsFinal] = useState(existingStatus?.isFinal || false)
  const [isCanceled, setIsCanceled] = useState(existingStatus?.isCanceled || false)
  const [wipLimit, setWipLimit] = useState<string>(
    existingStatus?.wipLimit != null ? String(existingStatus.wipLimit) : "",
  )
  const [selectedTransitions, setSelectedTransitions] = useState<string[]>(
    existingStatus?.transitions || [],
  )
  const [capabilities, setCapabilities] = useState<string[]>(existingStatus?.capabilities || [])

  const autoKey = useCallback((n: string) => {
    return n.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
  }, [])

  const parsedWipLimit = wipLimit.trim() ? parseInt(wipLimit, 10) : undefined
  const effectiveWipLimit = parsedWipLimit && parsedWipLimit > 0 ? parsedWipLimit : undefined

  const createMutation = useMutation({
    mutationFn: () =>
      workflowsApi.addStatus(workflowId, {
        name,
        key,
        color,
        isFinal,
        isCanceled,
        transitions: selectedTransitions,
        capabilities,
        position: allStatuses.length,
        wipLimit: effectiveWipLimit ?? null,
      }),
    onSuccess: () => {
      notify.success(t("workflows.page.toast.statusAdded"))
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      workflowsApi.updateStatus(workflowId, existingStatus!.id, {
        name,
        color,
        isFinal,
        isCanceled,
        transitions: selectedTransitions,
        capabilities,
        wipLimit: effectiveWipLimit ?? null,
      } as Partial<WorkflowStatus>),
    onSuccess: () => {
      notify.success(t("workflows.page.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const mutation = isEditing ? updateMutation : createMutation
  const otherStatuses = allStatuses.filter((s) => s.id !== existingStatus?.id)

  const toggleTransition = (statusKey: string) => {
    setSelectedTransitions((prev) =>
      prev.includes(statusKey)
        ? prev.filter((k) => k !== statusKey)
        : [...prev, statusKey],
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("workflows.page.editStatus") : t("workflows.builder.addStatus")}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("workflows.page.editStatusDesc")
              : t("workflows.page.addStatusDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          {/* Name & Key */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("workflows.name")}</Label>
              <Input
                placeholder={t("workflows.page.statusNamePlaceholder")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!isEditing) setKey(autoKey(e.target.value))
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("workflows.page.key")}</Label>
              <Input
                placeholder={t("workflows.page.keyPlaceholder")}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                disabled={isEditing}
                className={isEditing ? "opacity-60" : ""}
              />
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>{t("workflows.page.color")}</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-7 w-7 rounded-lg border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? "var(--foreground)" : "transparent",
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Flags */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">{t("workflows.page.finalStatus")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("workflows.page.finalStatusHint")}
                </p>
              </div>
              <Switch checked={isFinal} onCheckedChange={setIsFinal} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">{t("workflows.page.canceledStatus")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("workflows.page.canceledStatusHint")}
                </p>
              </div>
              <Switch checked={isCanceled} onCheckedChange={setIsCanceled} />
            </div>
          </div>

          {/* WIP Limit */}
          {!isFinal && !isCanceled && (
            <div className="space-y-2">
              <div>
                <Label className="text-sm">{t("workflows.page.wipLimit")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("workflows.page.wipLimitHint")}
                </p>
              </div>
              <Input
                type="number"
                min={0}
                placeholder={t("workflows.page.noLimit")}
                value={wipLimit}
                onChange={(e) => setWipLimit(e.target.value)}
                className="w-32"
              />
            </div>
          )}

          {/* Transitions */}
          {otherStatuses.length > 0 && (
            <div className="space-y-2">
              <Label>{t("workflows.page.canTransitionTo")}</Label>
              <div className="flex flex-wrap gap-2">
                {otherStatuses.map((s) => {
                  const selected = selectedTransitions.includes(s.key)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => toggleTransition(s.key)}
                    >
                      <StatusDot color={s.color} size={8} />
                      {s.name}
                      {selected && <Check className="h-3 w-3" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Capabilities — execution widgets active at this step */}
          <div className="space-y-2">
            <Label>{t("workflows.page.capabilities")}</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((c) => {
                const on = capabilities.includes(c.key)
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() =>
                      setCapabilities((prev) => (on ? prev.filter((x) => x !== c.key) : [...prev, c.key]))
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      on
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t(c.labelKey)}
                    {on && <Check className="h-3 w-3" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !key.trim() || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? t("common.save") : t("workflows.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function WorkflowsSettingsPage() {
  return (
    <PlanGate feature="workflows">
      <WorkflowsSettingsPageInner />
    </PlanGate>
  )
}

function WorkflowsSettingsPageInner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean
    workflowId: string
    existingStatus: WorkflowStatus | null
    allStatuses: WorkflowStatus[]
  }>({ open: false, workflowId: "", existingStatus: null, allStatuses: [] })
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "workflow" | "status"
    workflowId: string
    statusId?: string
    name: string
  } | null>(null)

  // Only ADMIN can access
  if (user?.role !== "ADMIN") {
    router.push("/dashboard")
    return null
  }

  const { data: workflows, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.setDefault(id),
    onSuccess: () => {
      notify.success(t("workflows.page.toast.defaultUpdated"))
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: () => {
      notify.success(t("workflows.page.toast.taskTypeDeleted"))
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteStatusMutation = useMutation({
    mutationFn: ({ workflowId, statusId }: { workflowId: string; statusId: string }) =>
      workflowsApi.deleteStatus(workflowId, statusId),
    onSuccess: () => {
      notify.success(t("workflows.page.toast.statusDeleted"))
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const handleDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === "workflow") {
      deleteWorkflowMutation.mutate(deleteTarget.workflowId)
    } else if (deleteTarget.statusId) {
      deleteStatusMutation.mutate({
        workflowId: deleteTarget.workflowId,
        statusId: deleteTarget.statusId,
      })
    }
  }

  return (
    <div className="min-h-full bg-muted/30">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t("workflows.page.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("workflows.page.subtitle")}
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 rounded-xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("workflows.page.newTaskType")}
          </Button>
        </div>

        {/* Global fields — apply to every task, regardless of type */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t("workflows.page.globalFields")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("workflows.page.globalFieldsHint")}
            </span>
          </div>
          <CustomFieldsManager workflowId={null} />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !workflows || workflows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <div className="flex items-center justify-center h-14 w-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 mb-4">
              <GitBranch className="h-7 w-7 text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {t("workflows.page.empty.title")}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              {t("workflows.page.empty.description")}
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("workflows.page.empty.cta")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onSetDefault={(id) => setDefaultMutation.mutate(id)}
                onDelete={(id) =>
                  setDeleteTarget({
                    type: "workflow",
                    workflowId: id,
                    name: workflow.name,
                  })
                }
                onAddStatus={(wfId) => {
                  const wf = workflows.find((w) => w.id === wfId)
                  setStatusDialog({
                    open: true,
                    workflowId: wfId,
                    existingStatus: null,
                    allStatuses: wf?.statuses || [],
                  })
                }}
                onEditStatus={(wfId, status) => {
                  const wf = workflows.find((w) => w.id === wfId)
                  setStatusDialog({
                    open: true,
                    workflowId: wfId,
                    existingStatus: status,
                    allStatuses: wf?.statuses || [],
                  })
                }}
                onDeleteStatus={(wfId, status) =>
                  setDeleteTarget({
                    type: "status",
                    workflowId: wfId,
                    statusId: status.id,
                    name: status.name,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateWorkflowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {statusDialog.open && (
        <StatusDialog
          open={statusDialog.open}
          onOpenChange={(open) =>
            setStatusDialog((prev) => ({ ...prev, open }))
          }
          workflowId={statusDialog.workflowId}
          existingStatus={statusDialog.existingStatus}
          allStatuses={statusDialog.allStatuses}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "workflow" ? t("workflows.page.deleteWorkflow") : t("workflows.page.deleteStatus")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workflows.page.deleteConfirm", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
