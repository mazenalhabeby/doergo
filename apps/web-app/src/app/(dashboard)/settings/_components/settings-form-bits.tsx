"use client"

import { Loader2, Building2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

/** The small pieces every settings section is built from. */

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div className="flex-1 pr-4">
        <Label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}

export function FormField({
  icon: Icon,
  label,
  children,
}: {
  icon?: typeof Building2
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {label}
      </Label>
      {children}
    </div>
  )
}

export function SaveBar({
  onSave,
  isPending,
  t,
}: {
  onSave: () => void
  isPending: boolean
  t: (key: string) => string
}) {
  return (
    <div className="flex justify-end pt-4 border-t border-border mt-6">
      <Button
        onClick={onSave}
        disabled={isPending}
        className="gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl px-6"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isPending ? t("common.saving") : t("common.saveChanges")}
      </Button>
    </div>
  )
}
