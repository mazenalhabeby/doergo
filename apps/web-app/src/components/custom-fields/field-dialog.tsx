"use client"

import { useState, useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Hash, Calendar, Link2, Mail, CheckSquare, Type, ChevronDown, Plus, X } from "lucide-react"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { customFieldsApi, type CustomFieldDefinition, type CustomFieldType } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { SaveDialogFooter } from "@/components/common/save-dialog-footer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** The field types a custom field can have, with their label and icon. */
export const FIELD_TYPES: { value: CustomFieldType; labelKey: string; icon: typeof Type }[] = [
  { value: "TEXT", labelKey: "customFields.fieldTypes.TEXT", icon: Type },
  { value: "NUMBER", labelKey: "customFields.fieldTypes.NUMBER", icon: Hash },
  { value: "DATE", labelKey: "customFields.fieldTypes.DATE", icon: Calendar },
  { value: "DROPDOWN", labelKey: "customFields.fieldTypes.DROPDOWN", icon: ChevronDown },
  { value: "CHECKBOX", labelKey: "customFields.fieldTypes.CHECKBOX", icon: CheckSquare },
  { value: "URL", labelKey: "customFields.fieldTypes.URL", icon: Link2 },
  { value: "EMAIL", labelKey: "customFields.fieldTypes.EMAIL", icon: Mail },
]

// Create/Edit dialog — scope is fixed by the manager (workflowId), so there's
// no "Applies to" selector here.
export function FieldDialog({
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = !!existingField

  const [name, setName] = useState(existingField?.name || "")
  const [key, setKey] = useState(existingField?.key || "")
  const [type, setType] = useState<CustomFieldType>(existingField?.type || "TEXT")
  const [isRequired, setIsRequired] = useState(existingField?.isRequired || false)
  const [options, setOptions] = useState<string[]>(existingField?.options || [])
  const [newOption, setNewOption] = useState("")

  const autoKey = useCallback((n: string) => {
    return n
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
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
      notify.success(t("customFields.fieldCreated"))
      queryClient.invalidateQueries({ queryKey: keys.customFields.definitions() })
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
      notify.success(t("customFields.fieldUpdated"))
      queryClient.invalidateQueries({ queryKey: keys.customFields.definitions() })
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("customFields.editField") : t("customFields.newField")}</DialogTitle>
          <DialogDescription>
            {workflowId ? t("customFields.scopedDescription") : t("customFields.globalDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("customFields.nameLabel")}</Label>
            <Input
              placeholder={t("customFields.namePlaceholder")}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!isEditing) setKey(autoKey(e.target.value))
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("customFields.keyLabel")}</Label>
            <Input
              placeholder={t("customFields.keyPlaceholder")}
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              disabled={isEditing}
              className={isEditing ? "opacity-60" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("customFields.typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)} disabled={isEditing}>
              <SelectTrigger className={isEditing ? "opacity-60" : ""}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    <span className="flex items-center gap-2">
                      <ft.icon className="h-4 w-4 text-muted-foreground" />
                      {t(ft.labelKey)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "DROPDOWN" && (
            <div className="space-y-2">
              <Label>{t("customFields.optionsLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("customFields.addOptionPlaceholder")}
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
              <Label className="text-sm">{t("common.required")}</Label>
              <p className="text-xs text-muted-foreground">{t("customFields.requiredDescription")}</p>
            </div>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>
        </div>
        <SaveDialogFooter
          onCancel={() => onOpenChange(false)}
          onSave={() => mutation.mutate()}
          disabled={!name.trim() || !key.trim() || mutation.isPending}
          pending={mutation.isPending}
          isEditing={isEditing}
        />
      </DialogContent>
    </Dialog>
  )
}
