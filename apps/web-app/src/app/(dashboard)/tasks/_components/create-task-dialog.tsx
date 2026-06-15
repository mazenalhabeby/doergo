"use client"

import { useState, useCallback, useMemo, lazy, Suspense, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Calendar as CalendarIcon,
  Loader2,
  X,
  FileText,
  ChevronRight,
  Clock,
  MapPin,
  User,
  CheckSquare,
  Layers,
  SlidersHorizontal,
  Users,
  Plus,
  Trash2,
  GitBranch,
  Upload,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import {
  tasksApi,
  taskAttachmentsApi,
  phasesApi,
  sprintsApi,
  epicsApi,
  customFieldsApi,
  organizationsApi,
  locationsApi,
  workflowsApi,
  STORY_POINT_OPTIONS,
  type CreateTaskInput,
  type Phase,
  type Sprint,
  type Epic,
  type CustomFieldDefinition,
  type OrgMember,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { PrioritySelector } from "@/components/tasks"

const LocationPicker = lazy(() =>
  import("@/components/location-picker").then((m) => ({ default: m.LocationPicker }))
)

// ---------------------------------------------------------------------------
// CollapsibleSection — compact accordion section for dialog
// ---------------------------------------------------------------------------
function CollapsibleSection({
  icon: Icon,
  label,
  children,
  defaultOpen = false,
  indicator,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
  indicator?: string | null
  disabled?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} disabled={disabled}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center w-full gap-2.5 px-3 py-2.5 rounded-lg border border-border/60 bg-card",
            "hover:bg-accent/50 transition-all duration-150 group text-left",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          <Icon className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="text-sm font-medium text-foreground flex-1">{label}</span>
          {indicator && !open && (
            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full max-w-[180px] truncate">
              {indicator}
            </span>
          )}
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-1 data-[state=open]:slide-down-1">
        <div className="pt-2 pb-1 space-y-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSprintId?: string | null
  defaultSpaceId?: string | null
}

// ---------------------------------------------------------------------------
// CreateTaskDialog
// ---------------------------------------------------------------------------
export function CreateTaskDialog({ open, onOpenChange, defaultSprintId, defaultSpaceId }: CreateTaskDialogProps) {
  const { t } = useTranslation()
  const { user, hasModule: orgHasModule } = useAuth()
  const queryClient = useQueryClient()

  // ── Space state ──
  const [spaceId, setSpaceId] = useState<string>("none")

  // ── Space-aware module resolution ──
  const { hasModule: spaceHasModule } = useSpaceModules(spaceId !== "none" ? spaceId : null)
  const hasModule = spaceId !== "none" ? spaceHasModule : orgHasModule

  // ── Core form state ──
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM")

  // ── Agile fields ──
  const [storyPoints, setStoryPoints] = useState<number | null>(null)
  const [epicId, setEpicId] = useState("none")

  // ── Schedule section ──
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [estimatedHours, setEstimatedHours] = useState("")

  // ── Location section ──
  const [locationAddress, setLocationAddress] = useState("")
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)

  // ── Checklist section ──
  const [checklistItems, setChecklistItems] = useState<string[]>([])
  const [newChecklistItem, setNewChecklistItem] = useState("")

  // ── Organization section ──
  const [phaseId, setPhaseId] = useState("none")
  const [sprintId, setSprintId] = useState("none")
  const [parentTaskId, setParentTaskId] = useState("none")

  // ── Attachments ──
  const [isDragOver, setIsDragOver] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // ── Custom fields ──
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})

  // ── Reset form when dialog opens ──
  useEffect(() => {
    if (open) {
      setSpaceId(defaultSpaceId ?? "none")
      setTitle("")
      setDescription("")
      setPriority("MEDIUM")
      setDueDate(undefined)
      setStartDate(undefined)
      setEstimatedHours("")
      setLocationAddress("")
      setLocationLat(null)
      setLocationLng(null)
      setChecklistItems([])
      setNewChecklistItem("")
      setPhaseId("none")
      setSprintId(defaultSprintId ?? "none")
      setParentTaskId("none")
      setAttachments([])
      setCustomFieldValues({})
      setIsDragOver(false)
      setIsSubmittingLocal(false)
      setStoryPoints(null)
      setEpicId("none")
    }
  }, [open])

  // ── Fetch custom fields ──
  const { data: customFields } = useQuery({
    queryKey: ["customFieldDefinitions"],
    queryFn: () => customFieldsApi.listDefinitions(),
    staleTime: 120000,
    retry: 1,
    enabled: open,
  })
  const activeCustomFields = useMemo(
    () => (customFields || []).filter((f) => f.isActive),
    [customFields],
  )

  // ── Fetch phases and sprints ──
  const { data: phases } = useQuery({
    queryKey: ["phases"],
    queryFn: () => phasesApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  const { data: sprints } = useQuery({
    queryKey: ["sprints"],
    queryFn: () => sprintsApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  // ── Fetch epics ──
  const { data: fetchedEpics } = useQuery({
    queryKey: ["epics"],
    queryFn: () => epicsApi.list(),
    staleTime: 60000,
    enabled: open,
  })

  // ── Fetch members for assignee picker ──
  const taskCreationScope = user?.taskCreationScope || "NONE"
  const isSelfScope = taskCreationScope === "SELF"
  const showAssigneePicker = taskCreationScope === "SPACE" || taskCreationScope === "ORG"

  const { data: membersData } = useQuery({
    queryKey: ["orgMembers", { limit: 50 }],
    queryFn: () => organizationsApi.getMembers({ limit: 50 }),
    staleTime: 60000,
    enabled: open && showAssigneePicker,
  })
  const members = membersData?.data ?? []

  // ── Fetch spaces ──
  const { data: spacesData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
    staleTime: 60000,
    enabled: open,
  })
  const availableSpaces = spacesData?.data || []
  const hasSpaces = availableSpaces.length > 0

  // ── Fetch workflows (task types) — "auto" inherits the space's default ──
  const { data: workflowsList } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
    staleTime: 300000,
    enabled: open,
  })
  const workflows = workflowsList || []
  const [workflowId, setWorkflowId] = useState<string>("auto")

  // ── Submission state ──
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: async (task) => {
      // Upload attachments if any
      if (attachments.length > 0 && task?.id) {
        for (const file of attachments) {
          try {
            const presign = await taskAttachmentsApi.getPresignedUrl(task.id, file.name, file.type)
            if (presign?.uploadUrl) {
              await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
              await taskAttachmentsApi.confirmUpload(task.id, {
                fileName: file.name,
                fileUrl: presign.fileUrl,
                fileType: file.type,
                fileSize: file.size,
              })
            }
          } catch {
            console.error(`Failed to upload attachment: ${file.name}`)
          }
        }
      }

      notify.taskCreated(title || t("tasks.create.successMessage"))
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
    },
    onError: (error: Error) => {
      notify.error(error.message || t("tasks.create.errorMessage"))
      setIsSubmittingLocal(false)
    },
  })

  // ── Validation ──
  const isFormValid = title.trim() !== ""
  const isSubmitting = isSubmittingLocal || createMutation.isPending

  // ── Custom field validation ──
  const requiredCustomFieldsMissing = activeCustomFields
    .filter((f) => f.isRequired)
    .some((f) => !customFieldValues[f.id]?.trim())

  // ── Submit ──
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isSubmitting) return

    if (!isFormValid) {
      notify.error(t("tasks.create.fillRequiredFields"))
      return
    }

    if (requiredCustomFieldsMissing) {
      notify.error("Please fill in all required custom fields")
      return
    }

    setIsSubmittingLocal(true)

    const parsedHours = estimatedHours ? parseFloat(estimatedHours) : undefined
    // Build custom field values array
    const cfValues = Object.entries(customFieldValues)
      .filter(([, v]) => v.trim())
      .map(([defId, value]) => ({ definitionId: defId, value }))

    // Build assignee list
    const assigneeIds: string[] = []
    if (isSelfScope && user?.id) {
      assigneeIds.push(user.id)
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate?.toISOString(),
      startDate: startDate?.toISOString(),
      estimatedHours: parsedHours && !isNaN(parsedHours) ? parsedHours : undefined,
      locationAddress: locationAddress.trim() || undefined,
      locationLat: locationLat ?? undefined,
      locationLng: locationLng ?? undefined,
      phaseId: phaseId !== "none" ? phaseId : undefined,
      sprintId: sprintId !== "none" ? sprintId : undefined,
      storyPoints: storyPoints ?? undefined,
      epicId: epicId !== "none" ? epicId : undefined,
      parentId: parentTaskId !== "none" ? parentTaskId : undefined,
      spaceId: spaceId !== "none" ? spaceId : undefined,
      workflowId: workflowId !== "auto" ? workflowId : undefined,
      checklistItems: checklistItems.length > 0
        ? checklistItems.map((text) => ({ text }))
        : undefined,
      customFieldValues: cfValues.length > 0 ? cfValues : undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
    })
  }

  // ── File handling ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("image/") || file.type === "application/pdf",
    )
    setAttachments((prev) => [...prev, ...files])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(
        (file) => file.type.startsWith("image/") || file.type === "application/pdf",
      )
      setAttachments((prev) => [...prev, ...files])
    }
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ── Checklist handlers ──
  const addChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems((prev) => [...prev, newChecklistItem.trim()])
      setNewChecklistItem("")
    }
  }

  const removeChecklistItem = (index: number) => {
    setChecklistItems((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Custom field handler ──
  const setCustomFieldValue = (defId: string, value: string) => {
    setCustomFieldValues((prev) => ({ ...prev, [defId]: value }))
  }

  // ── Section indicators ──
  const scheduleIndicator =
    startDate || dueDate || estimatedHours
      ? [
          startDate && format(startDate, "MMM d"),
          dueDate && format(dueDate, "MMM d"),
          estimatedHours && `${estimatedHours}h`,
        ]
          .filter(Boolean)
          .join(" - ")
      : null

  const locationIndicator = locationAddress || null
  const checklistIndicator =
    checklistItems.length > 0 ? `${checklistItems.length} item${checklistItems.length > 1 ? "s" : ""}` : null
  const orgIndicator =
    phaseId !== "none" || sprintId !== "none"
      ? [
          phaseId !== "none" && phases?.find((p: Phase) => p.id === phaseId)?.name,
          sprintId !== "none" && sprints?.find((s: Sprint) => s.id === sprintId)?.name,
        ]
          .filter(Boolean)
          .join(", ")
      : null
  const customFieldIndicator =
    Object.values(customFieldValues).filter((v) => v.trim()).length > 0
      ? `${Object.values(customFieldValues).filter((v) => v.trim()).length} set`
      : null

  const hasPhases = (phases ?? []).length > 0
  const hasSprints = (sprints ?? []).length > 0
  const hasCustomFields = activeCustomFields.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold">
            {t("tasks.create.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a new task for your organization
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
          {/* Space selector */}
          {hasSpaces && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Space</Label>
              <Select value={spaceId} onValueChange={setSpaceId} disabled={isSubmitting}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                  <SelectValue placeholder="Select a space" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No space</SelectItem>
                  {availableSpaces.map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3 text-muted-foreground" />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Type / workflow — "Auto" inherits the selected space's default */}
          {workflows.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Type</Label>
              <Select value={workflowId} onValueChange={setWorkflowId} disabled={isSubmitting}>
                <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (from space)</SelectItem>
                  {workflows.map((w: { id: string; name: string }) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <Input
            placeholder={t("tasks.create.taskTitlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-lg border-border bg-card text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20"
            autoFocus
          />

          {/* Description */}
          <Textarea
            placeholder={t("tasks.create.descriptionPlaceholder")}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            className="rounded-lg border-border bg-card text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20 resize-none min-h-[60px]"
          />

          {/* Priority only */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("tasks.create.priorityLabel")}
            </Label>
            <PrioritySelector value={priority} onChange={setPriority} disabled={isSubmitting} />
          </div>

          {/* Collapsible Sections */}
          <div className="space-y-1.5 pt-1">
            {/* Schedule */}
            <CollapsibleSection icon={Clock} label="Schedule" indicator={scheduleIndicator}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left text-sm font-normal rounded-lg border-border bg-card hover:bg-accent",
                          !startDate && "text-muted-foreground",
                        )}
                        disabled={isSubmitting}
                      >
                        <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
                        {startDate ? format(startDate, "MMM d, yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t("tasks.create.preferredDateLabel")}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left text-sm font-normal rounded-lg border-border bg-card hover:bg-accent",
                          !dueDate && "text-muted-foreground",
                        )}
                        disabled={isSubmitting}
                      >
                        <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
                        {dueDate ? format(dueDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {hasModule('time_tracking') && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Estimated Hours</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 4"
                    value={estimatedHours}
                    onChange={(e) => setEstimatedHours(e.target.value)}
                    disabled={isSubmitting}
                    className="h-9 rounded-lg border-border bg-card text-sm placeholder:text-muted-foreground"
                  />
                </div>
              )}
            </CollapsibleSection>

            {/* Assignment */}
            {(isSelfScope || showAssigneePicker) && (
              <CollapsibleSection
                icon={Users}
                label="Assignment"
                indicator={isSelfScope ? "Assigned to you" : null}
              >
                {isSelfScope ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                    <User className="size-3.5 text-blue-600" />
                    <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                      This task will be assigned to you
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Assign to</Label>
                    <Select disabled={isSubmitting}>
                      <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                        <SelectValue placeholder="Select a team member" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member: OrgMember) => (
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center gap-2">
                              <div className="size-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-[8px] font-semibold text-white">
                                  {member.firstName?.[0]}
                                  {member.lastName?.[0]}
                                </span>
                              </div>
                              {member.firstName} {member.lastName}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Location */}
            <CollapsibleSection icon={MapPin} label="Location" indicator={locationIndicator}>
              <Suspense
                fallback={
                  <div className="h-[200px] rounded-lg border border-border bg-muted flex items-center justify-center">
                    <Loader2 className="size-5 text-muted-foreground animate-spin" />
                  </div>
                }
              >
                <LocationPicker
                  address={locationAddress}
                  lat={locationLat}
                  lng={locationLng}
                  onLocationChange={(addr, lat, lng) => {
                    setLocationAddress(addr)
                    setLocationLat(lat)
                    setLocationLng(lng)
                  }}
                  disabled={isSubmitting}
                />
              </Suspense>
            </CollapsibleSection>

            {/* Checklist — only when module is enabled */}
            {hasModule('checklists') && <CollapsibleSection icon={CheckSquare} label="Checklist" indicator={checklistIndicator}>
              {checklistItems.length > 0 && (
                <div className="space-y-1">
                  {checklistItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/50 group"
                    >
                      <CheckSquare className="size-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground flex-1 truncate">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(index)}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="size-3 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add checklist item..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addChecklistItem()
                    }
                  }}
                  disabled={isSubmitting}
                  className="h-8 rounded-lg border-border bg-card text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 rounded-lg"
                  onClick={addChecklistItem}
                  disabled={!newChecklistItem.trim() || isSubmitting}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </CollapsibleSection>}

            {/* Organization (Phase, Sprint, Parent Task) */}
            {((hasPhases && hasModule('phases')) || (hasSprints && hasModule('sprints'))) && (
              <CollapsibleSection icon={Layers} label="Organization" indicator={orgIndicator}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hasPhases && hasModule('phases') && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Phase</Label>
                      <Select value={phaseId} onValueChange={setPhaseId} disabled={isSubmitting}>
                        <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                          <SelectValue placeholder="No phase" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No phase</SelectItem>
                          {(phases || []).map((phase: Phase) => (
                            <SelectItem key={phase.id} value={phase.id}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: phase.color }}
                                />
                                {phase.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {hasSprints && hasModule('sprints') && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Sprint</Label>
                      <Select value={sprintId} onValueChange={setSprintId} disabled={isSubmitting}>
                        <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                          <SelectValue placeholder="No sprint" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No sprint</SelectItem>
                          {(sprints || []).map((sprint: Sprint) => (
                            <SelectItem key={sprint.id} value={sprint.id}>
                              {sprint.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <GitBranch className="size-3" />
                    Subtask of (optional)
                  </Label>
                  <Input
                    placeholder="Paste parent task ID..."
                    value={parentTaskId === "none" ? "" : parentTaskId}
                    onChange={(e) => setParentTaskId(e.target.value || "none")}
                    disabled={isSubmitting}
                    className="h-9 rounded-lg border-border bg-card text-sm"
                  />
                </div>
              </CollapsibleSection>
            )}

            {/* More Options (Story Points, Epic, Workflow, Custom Fields) */}
            {(hasModule('story_points') || hasModule('epics') || (hasCustomFields && hasModule('custom_fields'))) && (
            <CollapsibleSection
              icon={SlidersHorizontal}
              label="More Options"
              indicator={[
                hasModule('story_points') && storyPoints != null ? `${storyPoints} pts` : null,
                hasModule('epics') && epicId !== "none" ? "Epic set" : null,
              ].filter(Boolean).join(" · ") || null}
            >
              {/* Story Points */}
              {hasModule('story_points') && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Story Points</Label>
                <div className="flex items-center gap-1">
                  {STORY_POINT_OPTIONS.map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      onClick={() => setStoryPoints(storyPoints === pts ? null : pts)}
                      disabled={isSubmitting}
                      className={cn(
                        "h-7 min-w-[32px] px-2 rounded-md text-xs font-bold tabular-nums transition-colors duration-100",
                        storyPoints === pts
                          ? "bg-blue-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {pts}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Epic */}
              {hasModule('epics') && (fetchedEpics ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Epic</Label>
                  <Select value={epicId} onValueChange={setEpicId} disabled={isSubmitting}>
                    <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                      <SelectValue placeholder="No epic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No epic</SelectItem>
                      {(fetchedEpics ?? []).map((epic: Epic) => (
                        <SelectItem key={epic.id} value={epic.id}>
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
                            {epic.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}


              {/* Custom Fields */}
              {hasModule('custom_fields') && hasCustomFields && activeCustomFields.map((field: CustomFieldDefinition) => (
                <div key={field.id} className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {field.name}
                    {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {renderCustomFieldInput(field, customFieldValues[field.id] ?? "", (v) =>
                    setCustomFieldValue(field.id, v),
                    isSubmitting,
                  )}
                </div>
              ))}
            </CollapsibleSection>
            )}
          </div>

          {/* Attachments — compact drop zone */}
          <div className="space-y-2 pt-1">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "relative rounded-lg border-2 border-dashed transition-all duration-150",
                isDragOver
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-500/10"
                  : "border-border/60 bg-card hover:border-border",
              )}
            >
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-center gap-2 py-4 px-4">
                <Upload className="size-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {t("tasks.create.dragAndDrop")} &middot; {t("tasks.create.imagesAndPdfOnly")}
                </p>
              </div>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <div key={index} className="group relative">
                    {file.type.startsWith("image/") ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                        >
                          <X className="size-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative flex items-center gap-1.5 rounded-lg bg-muted border border-border pl-2 pr-1.5 py-1.5">
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground max-w-[80px] truncate">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="p-0.5 rounded-full hover:bg-muted transition-colors"
                        >
                          <X className="size-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!isFormValid || isSubmitting || requiredCustomFieldsMissing}
            className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white transition-colors duration-150 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Task"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Custom field input renderer
// ---------------------------------------------------------------------------
function renderCustomFieldInput(
  field: CustomFieldDefinition,
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
) {
  const inputClass = "h-9 rounded-lg border-border bg-card text-sm placeholder:text-muted-foreground"

  switch (field.type) {
    case "TEXT":
      return (
        <Input
          placeholder={`Enter ${field.name.toLowerCase()}...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )

    case "NUMBER":
      return (
        <Input
          type="number"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )

    case "DATE":
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 w-full justify-start text-left text-sm font-normal rounded-lg border-border bg-card hover:bg-accent",
                !value && "text-muted-foreground",
              )}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
              {value ? format(new Date(value), "MMM d, yyyy") : `Select ${field.name.toLowerCase()}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value ? new Date(value) : undefined}
              onSelect={(date) => onChange(date?.toISOString() ?? "")}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )

    case "DROPDOWN":
      return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
            <SelectValue placeholder={`Select ${field.name.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case "CHECKBOX":
      return (
        <div className="flex items-center gap-2 py-1">
          <Checkbox
            id={`cf-dialog-${field.id}`}
            checked={value === "true"}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
            disabled={disabled}
          />
          <label
            htmlFor={`cf-dialog-${field.id}`}
            className="text-sm text-foreground cursor-pointer"
          >
            {field.name}
          </label>
        </div>
      )

    case "URL":
      return (
        <Input
          type="url"
          placeholder="https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )

    case "EMAIL":
      return (
        <Input
          type="email"
          placeholder="email@example.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )

    default:
      return (
        <Input
          placeholder={`Enter ${field.name.toLowerCase()}...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )
  }
}
