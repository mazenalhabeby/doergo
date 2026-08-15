"use client"

import { useState, memo } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Play,
  Pause,
  Calendar,
  Clock,
  Repeat,
  ChevronLeft,
  MapPin,
  GitBranch,
  X,
  AlertCircle,
} from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  recurringTasksApi,
  workflowsApi,
  locationsApi,
  type RecurringTaskTemplate,
  type RecurringFrequency,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const FREQUENCY_VALUES: RecurringFrequency[] = [
  "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM",
]

const PRIORITIES = [
  { value: "LOW", color: "text-slate-500 bg-slate-100 dark:bg-slate-800" },
  { value: "MEDIUM", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { value: "HIGH", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
  { value: "URGENT", color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
]

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

type TFn = (key: string, opts?: Record<string, unknown>) => string

function getFrequencyLabel(freq: RecurringFrequency, customDays: number | null | undefined, t: TFn): string {
  if (freq === "CUSTOM" && customDays) return t("tasks.recurring.everyNDaysValue", { count: customDays })
  return t(`tasks.recurring.frequencies.${freq}`)
}

function getPriorityColor(priority: string): string {
  return PRIORITIES.find((p) => p.value === priority)?.color || PRIORITIES[0]!.color
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ============================================================================
// Template Card
// ============================================================================

const TemplateCard = memo(function TemplateCard({
  template,
  onEdit,
  onDelete,
  onGenerate,
  onToggle,
}: {
  template: RecurringTaskTemplate
  onEdit: () => void
  onDelete: () => void
  onGenerate: () => void
  onToggle: (active: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="px-6 py-4">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 shrink-0 mt-0.5">
            <Repeat className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {template.title}
              </h3>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${getPriorityColor(template.priority)}`}>
                {t(`tasks.priority.${template.priority}`)}
              </span>
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                {template.description}
              </p>
            )}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {getFrequencyLabel(template.frequency, template.customDays, t)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {template.space?.name ?? t("tasks.recurring.noSpace")}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {template.workflow?.name ?? t("tasks.recurring.defaultType")}
              </span>
              {template.nextRunAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {t("tasks.recurring.nextRun", { date: formatDate(template.nextRunAt) })}
                </span>
              )}
              {template.estimatedHours && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {template.estimatedHours}h
                </span>
              )}
              {template.checklist && template.checklist.length > 0 && (
                <span className="text-muted-foreground">
                  {t("tasks.recurring.checklistItemsCount", { count: template.checklist.length })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={template.isActive}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-green-500"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={onGenerate}
              disabled={!template.isActive}
            >
              <Play className="h-3 w-3" />
              {t("tasks.recurring.generate")}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// Create/Edit Template Dialog
// ============================================================================

function TemplateDialog({
  open,
  onOpenChange,
  existingTemplate,
  defaultSpaceId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTemplate: RecurringTaskTemplate | null
  /** Pre-selected space when creating new (e.g. the active space filter). */
  defaultSpaceId?: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = !!existingTemplate

  const [title, setTitle] = useState(existingTemplate?.title || "")
  const [description, setDescription] = useState(existingTemplate?.description || "")
  const [priority, setPriority] = useState(existingTemplate?.priority || "MEDIUM")
  const [spaceId, setSpaceId] = useState(existingTemplate?.spaceId || defaultSpaceId || "none")
  const [workflowId, setWorkflowId] = useState(existingTemplate?.workflowId || "none")

  const { data: spacesResp } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list({ limit: 100 }),
  })
  const spaces = spacesResp?.data ?? []
  const { data: taskTypes = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    existingTemplate?.frequency || "WEEKLY",
  )
  const [customDays, setCustomDays] = useState<number>(existingTemplate?.customDays || 7)
  const [dayOfWeek, setDayOfWeek] = useState<number>(existingTemplate?.dayOfWeek ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState<number>(existingTemplate?.dayOfMonth ?? 1)
  const [startDate, setStartDate] = useState(
    existingTemplate?.startDate
      ? existingTemplate.startDate.split("T")[0]
      : new Date().toISOString().split("T")[0],
  )
  const [endDate, setEndDate] = useState(
    existingTemplate?.endDate ? existingTemplate.endDate.split("T")[0] : "",
  )
  const [estimatedHours, setEstimatedHours] = useState<string>(
    existingTemplate?.estimatedHours?.toString() || "",
  )
  const [locationAddress, setLocationAddress] = useState(existingTemplate?.locationAddress || "")
  const [checklistItems, setChecklistItems] = useState<string[]>(
    existingTemplate?.checklist?.map((c) => c.text) || [],
  )
  const [newChecklistItem, setNewChecklistItem] = useState("")

  const buildPayload = () => ({
    title,
    description: description || null,
    priority,
    spaceId: spaceId === "none" ? null : spaceId,
    workflowId: workflowId === "none" ? null : workflowId,
    frequency,
    customDays: frequency === "CUSTOM" ? customDays : null,
    dayOfWeek: ["WEEKLY", "BIWEEKLY"].includes(frequency) ? dayOfWeek : null,
    dayOfMonth: ["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) ? dayOfMonth : null,
    startDate: new Date(startDate).toISOString(),
    endDate: endDate ? new Date(endDate).toISOString() : null,
    estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
    locationAddress: locationAddress || null,
    checklist: checklistItems.length > 0 ? checklistItems.map((text) => ({ text })) : null,
  })

  const createMutation = useMutation({
    mutationFn: () => recurringTasksApi.create(buildPayload()),
    onSuccess: () => {
      notify.success(t("tasks.recurring.templateCreated"))
      queryClient.invalidateQueries({ queryKey: ["recurringTasks"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => recurringTasksApi.update(existingTemplate!.id, buildPayload()),
    onSuccess: () => {
      notify.success(t("tasks.recurring.templateUpdated"))
      queryClient.invalidateQueries({ queryKey: ["recurringTasks"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const mutation = isEditing ? updateMutation : createMutation

  const addChecklistItem = () => {
    const trimmed = newChecklistItem.trim()
    if (trimmed) {
      setChecklistItems([...checklistItems, trimmed])
      setNewChecklistItem("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("tasks.recurring.editTemplate") : t("tasks.recurring.createTemplate")}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("tasks.recurring.editTemplateDescription")
              : t("tasks.recurring.createTemplateDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>{t("tasks.columns.title")}</Label>
            <Input
              placeholder={t("tasks.recurring.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("tasks.description.label")}</Label>
            <Textarea
              placeholder={t("tasks.recurring.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Space & Task Type — where generated tasks land + their type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.groupBy.space")}</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tasks.create.selectSpace")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.recurring.noSpace")}</SelectItem>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.recurring.taskType")}</Label>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tasks.recurring.default")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.recurring.default")}</SelectItem>
                  {taskTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority & Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.list.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {t(`tasks.priority.${p.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.recurring.frequency")}</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_VALUES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`tasks.recurring.frequencies.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Frequency-specific options */}
          {frequency === "CUSTOM" && (
            <div className="space-y-2">
              <Label>{t("tasks.recurring.everyNDays")}</Label>
              <Input
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
              />
            </div>
          )}

          {["WEEKLY", "BIWEEKLY"].includes(frequency) && (
            <div className="space-y-2">
              <Label>{t("tasks.recurring.dayOfWeek")}</Label>
              <Select
                value={dayOfWeek.toString()}
                onValueChange={(v) => setDayOfWeek(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_KEYS.map((name, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      {t(`tasks.weekdaysFull.${name}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) && (
            <div className="space-y-2">
              <Label>{t("tasks.recurring.dayOfMonth")}</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
              />
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.sidebar.startDate")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.recurring.endDateOptional")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Estimated Hours & Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tasks.sidebar.estimatedHours")}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder={t("tasks.fields.estimatedHoursPlaceholder")}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.sidebar.location")}</Label>
              <Input
                placeholder={t("tasks.fields.addressShort")}
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-2">
            <Label>{t("tasks.sections.checklist")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t("tasks.create.addChecklistItem")}
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChecklistItem}
                disabled={!newChecklistItem.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {checklistItems.length > 0 && (
              <div className="space-y-1 mt-2">
                {checklistItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm"
                  >
                    <span className="flex-1">{item}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setChecklistItems(checklistItems.filter((_, idx) => idx !== i))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? t("common.save") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export function RecurringPanel({
  embedded = false,
  spaceId = null,
}: {
  embedded?: boolean
  /** When set, only show templates that generate into this space. */
  spaceId?: string | null
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RecurringTaskTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTaskTemplate | null>(null)

  if (user?.role !== "ADMIN") {
    if (!embedded) router.push("/dashboard")
    return null
  }

  const { data: templates, isLoading } = useQuery({
    queryKey: ["recurringTasks"],
    queryFn: () => recurringTasksApi.list(),
  })

  // Narrow to the selected space tab (null = all spaces).
  const visibleTemplates = (templates ?? []).filter(
    (t) => !spaceId || t.spaceId === spaceId,
  )

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      recurringTasksApi.update(id, { isActive } as Partial<RecurringTaskTemplate>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurringTasks"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.generate(id),
    onSuccess: () => {
      notify.success(t("tasks.recurring.taskGenerated"))
      queryClient.invalidateQueries({ queryKey: ["recurringTasks"] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.delete(id),
    onSuccess: () => {
      notify.success(t("tasks.recurring.templateDeleted"))
      queryClient.invalidateQueries({ queryKey: ["recurringTasks"] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className={embedded ? "" : "min-h-full bg-muted/30"}>
      <div className={embedded ? "" : "max-w-[1440px] mx-auto px-6 py-6"}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {!embedded && (
              <button
                onClick={() => router.push("/tasks")}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("tasks.page.heading")}
              </button>
            )}
            <h1 className="text-2xl font-semibold text-foreground">
              {t("tasks.recurring.pageTitle")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("tasks.recurring.pageSubtitle")}
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingTemplate(null)
              setShowDialog(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 rounded-xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("tasks.recurring.newTemplate")}
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <div className="flex items-center justify-center h-14 w-14 mx-auto rounded-2xl bg-violet-50 dark:bg-violet-900/20 mb-4">
              <Repeat className="h-7 w-7 text-violet-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {spaceId ? t("tasks.recurring.emptyInSpace") : t("tasks.recurring.emptyTitle")}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              {t("tasks.recurring.emptyHint")}
            </p>
            <Button
              onClick={() => {
                setEditingTemplate(null)
                setShowDialog(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("tasks.recurring.createFirst")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => {
                  setEditingTemplate(template)
                  setShowDialog(true)
                }}
                onDelete={() => setDeleteTarget(template)}
                onGenerate={() => generateMutation.mutate(template.id)}
                onToggle={(active) =>
                  toggleMutation.mutate({ id: template.id, isActive: active })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showDialog && (
        <TemplateDialog
          open={showDialog}
          onOpenChange={(open) => {
            setShowDialog(open)
            if (!open) setEditingTemplate(null)
          }}
          existingTemplate={editingTemplate}
          defaultSpaceId={spaceId}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks.recurring.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks.recurring.deleteDescription", { name: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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


