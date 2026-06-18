"use client"

import { useState, useCallback, memo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Hash,
  Calendar,
  Link2,
  Mail,
  CheckSquare,
  Type,
  ChevronDown,
  X,
} from "lucide-react"
import { notify } from "@/lib/toast"

import {
  customFieldsApi,
  type CustomFieldDefinition,
  type CustomFieldType,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

const FIELD_TYPES: { value: CustomFieldType; label: string; icon: typeof Type }[] = [
  { value: "TEXT", label: "Text", icon: Type },
  { value: "NUMBER", label: "Number", icon: Hash },
  { value: "DATE", label: "Date", icon: Calendar },
  { value: "DROPDOWN", label: "Dropdown", icon: ChevronDown },
  { value: "CHECKBOX", label: "Checkbox", icon: CheckSquare },
  { value: "URL", label: "URL", icon: Link2 },
  { value: "EMAIL", label: "Email", icon: Mail },
]

function getFieldIcon(type: CustomFieldType) {
  return FIELD_TYPES.find((f) => f.value === type)?.icon || Type
}

function getFieldColor(type: CustomFieldType): string {
  const colors: Record<CustomFieldType, string> = {
    TEXT: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
    NUMBER: "text-violet-600 bg-violet-50 dark:bg-violet-900/20",
    DATE: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
    DROPDOWN: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
    CHECKBOX: "text-green-600 bg-green-50 dark:bg-green-900/20",
    URL: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20",
    EMAIL: "text-pink-600 bg-pink-50 dark:bg-pink-900/20",
  }
  return colors[type] || "text-slate-600 bg-slate-50"
}

const FieldRow = memo(function FieldRow({
  field,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  field: CustomFieldDefinition
  onEdit: () => void
  onDelete: () => void
  onToggleActive: (active: boolean) => void
}) {
  const Icon = getFieldIcon(field.type)
  const colorClass = getFieldColor(field.type)

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{field.name}</span>
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {field.key}
          </span>
          {field.isRequired && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Required
            </span>
          )}
        </div>
        {field.type === "DROPDOWN" && field.options && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Options: {field.options.join(", ")}
          </p>
        )}
      </div>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {field.type}
      </span>
      <Switch
        checked={field.isActive}
        onCheckedChange={onToggleActive}
        className="data-[state=checked]:bg-green-500"
      />
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
})

// Create/Edit dialog — scope is fixed by the manager (workflowId), so there's
// no "Applies to" selector here.
function FieldDialog({
  open,
  onOpenChange,
  existingField,
  workflowId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingField: CustomFieldDefinition | null
  workflowId: string | null
}) {
  const queryClient = useQueryClient()
  const isEditing = !!existingField

  const [name, setName] = useState(existingField?.name || "")
  const [key, setKey] = useState(existingField?.key || "")
  const [type, setType] = useState<CustomFieldType>(existingField?.type || "TEXT")
  const [isRequired, setIsRequired] = useState(existingField?.isRequired || false)
  const [options, setOptions] = useState<string[]>(existingField?.options || [])
  const [newOption, setNewOption] = useState("")

  const autoKey = useCallback((n: string) => {
    return n.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
  }, [])

  const createMutation = useMutation({
    mutationFn: () =>
      customFieldsApi.createDefinition({
        name,
        key,
        type,
        isRequired,
        options: type === "DROPDOWN" ? options : undefined,
        workflowId,
      }),
    onSuccess: () => {
      notify.success("Field created")
      queryClient.invalidateQueries({ queryKey: ["customFieldDefinitions"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      customFieldsApi.updateDefinition(existingField!.id, {
        name,
        isRequired,
        options: type === "DROPDOWN" ? options : undefined,
      } as Partial<CustomFieldDefinition>),
    onSuccess: () => {
      notify.success("Field updated")
      queryClient.invalidateQueries({ queryKey: ["customFieldDefinitions"] })
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const mutation = isEditing ? updateMutation : createMutation

  const addOption = () => {
    const trimmed = newOption.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setNewOption("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Field" : "New Field"}</DialogTitle>
          <DialogDescription>
            {workflowId ? "Shown on tasks of this type." : "Shown on every task."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Customer Phone"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!isEditing) setKey(autoKey(e.target.value))
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Key</Label>
            <Input
              placeholder="customer_phone"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              disabled={isEditing}
              className={isEditing ? "opacity-60" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)} disabled={isEditing}>
              <SelectTrigger className={isEditing ? "opacity-60" : ""}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    <span className="flex items-center gap-2">
                      <ft.icon className="h-4 w-4 text-muted-foreground" />
                      {ft.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "DROPDOWN" && (
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add option..."
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                />
                <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={!newOption.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {options.map((opt, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-sm">
                      {opt}
                      <button
                        type="button"
                        onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Required</Label>
              <p className="text-xs text-muted-foreground">Must be filled on tasks</p>
            </div>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !key.trim() || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Manage the custom fields for a single scope — a Task Type (workflowId) or the
 * global set (workflowId = null). Embeds inside the Task Types editor so a
 * type's fields live next to its statuses & capabilities.
 */
export function CustomFieldsManager({ workflowId }: { workflowId: string | null }) {
  const queryClient = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null)

  const { data: allFields, isLoading } = useQuery({
    queryKey: ["customFieldDefinitions"],
    queryFn: () => customFieldsApi.listDefinitions(),
  })

  const fields = (allFields || [])
    .filter((f) => (f.workflowId ?? null) === workflowId)
    .sort((a, b) => a.position - b.position)

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      customFieldsApi.updateDefinition(id, { isActive } as Partial<CustomFieldDefinition>),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customFieldDefinitions"] }),
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customFieldsApi.deleteDefinition(id),
    onSuccess: () => {
      notify.success("Field deleted")
      queryClient.invalidateQueries({ queryKey: ["customFieldDefinitions"] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          {fields.length} field{fields.length !== 1 ? "s" : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setEditingField(null)
            setShowDialog(true)
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Field
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Loading…</div>
      ) : fields.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No fields yet. Add one to capture extra data on these tasks.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              onEdit={() => {
                setEditingField(field)
                setShowDialog(true)
              }}
              onDelete={() => setDeleteTarget(field)}
              onToggleActive={(active) => toggleMutation.mutate({ id: field.id, isActive: active })}
            />
          ))}
        </div>
      )}

      {showDialog && (
        <FieldDialog
          open={showDialog}
          onOpenChange={(open) => {
            setShowDialog(open)
            if (!open) setEditingField(null)
          }}
          existingField={editingField}
          workflowId={workflowId}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes its values from existing tasks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
