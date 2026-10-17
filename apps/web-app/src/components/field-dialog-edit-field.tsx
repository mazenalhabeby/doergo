"use client"

import { Plus, X } from "lucide-react"
import { type CustomFieldType } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { SaveDialogFooter } from "@/components/save-dialog-footer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FIELD_TYPES } from "./field-dialog-helpers"
import type { FieldDialogState } from "./use-field-dialog"
import type { FieldDialog } from "./custom-fields-manager"

/** Part of FieldDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function FieldDialogEditField({ vm, workflowId, onOpenChange }: { vm: FieldDialogState; workflowId: Parameters<typeof FieldDialog>[0]['workflowId']; onOpenChange: Parameters<typeof FieldDialog>[0]['onOpenChange'] }) {
  const {
    isEditing,
    t,
    name,
    setName,
    setKey,
    autoKey,
    key,
    type,
    setType,
    newOption,
    setNewOption,
    addOption,
    options,
    setOptions,
    isRequired,
    setIsRequired,
    mutation,
  } = vm
  return (
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
  )
}
