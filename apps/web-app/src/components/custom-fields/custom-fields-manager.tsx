"use client"

import { keys } from "@/lib/query-keys"
import { useState, memo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, Pencil, Type } from "lucide-react"
import { notify } from "@/lib/toast"

import { customFieldsApi, type CustomFieldDefinition, type CustomFieldType } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { FIELD_TYPES, FieldDialog } from "./field-dialog"

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
  const { t } = useTranslation()
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
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{field.key}</span>
          {field.isRequired && (
            <span
              className={
                "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full " +
                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }
            >
              {t("common.required")}
            </span>
          )}
        </div>
        {field.type === "DROPDOWN" && field.options && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {t("customFields.optionsList", { options: field.options.join(", ") })}
          </p>
        )}
      </div>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{field.type}</span>
      <Switch checked={field.isActive} onCheckedChange={onToggleActive} className="data-[state=checked]:bg-green-500" />
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

/**
 * Manage the custom fields for a single scope — a Task Type (workflowId) or the
 * global set (workflowId = null). Embeds inside the Task Types editor so a
 * type's fields live next to its statuses & capabilities.
 */
export function CustomFieldsManager({ workflowId }: { workflowId: string | null }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null)

  const { data: allFields, isLoading } = useQuery({
    queryKey: keys.customFields.definitions(),
    queryFn: () => customFieldsApi.listDefinitions(),
  })

  const fields = (allFields || [])
    .filter((f) => (f.workflowId ?? null) === workflowId)
    .sort((a, b) => a.position - b.position)

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      customFieldsApi.updateDefinition(id, { isActive } as Partial<CustomFieldDefinition>),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.customFields.definitions() }),
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customFieldsApi.deleteDefinition(id),
    onSuccess: () => {
      notify.success(t("customFields.fieldDeleted"))
      queryClient.invalidateQueries({ queryKey: keys.customFields.definitions() })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          {t("customFields.fieldCount", { count: fields.length })}
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
          {t("customFields.newField")}
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">{t("common.loading")}</div>
      ) : fields.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t("customFields.emptyState")}</div>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t("customFields.deleteTitle", { name: deleteTarget?.name })}
        description={t("customFields.deleteDescription")}
        confirmLabel={t("common.delete")}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        destructive
      />
    </div>
  )
}
