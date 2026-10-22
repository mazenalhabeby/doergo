"use client"

import { parseISO } from "date-fns"
import { localDateKey } from "@hbcfield/shared/client"
import { type CustomFieldDefinition } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// ---------------------------------------------------------------------------
// Custom field input renderer
// ---------------------------------------------------------------------------
export function renderCustomFieldInput(
  field: CustomFieldDefinition,
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const inputClass = "h-9 rounded-lg border-border bg-card text-sm placeholder:text-muted-foreground"

  switch (field.type) {
    case "TEXT":
      return (
        <Input
          placeholder={t("tasks.customFields.enterPlaceholder", { name: field.name })}
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
          placeholder={t("tasks.customFields.enterPlaceholder", { name: field.name })}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )

    case "DATE":
      /*
        What is sent is unchanged: the picked LOCAL midnight as an instant
        (`toISOString()`), as this field always sent it. The picker itself
        speaks `YYYY-MM-DD`, so the conversion happens here, at the edge.
      */
      return (
        <DatePicker
          value={value ? localDateKey(new Date(value)) : ""}
          onChange={(day) => onChange(day ? parseISO(day).toISOString() : "")}
          disabled={disabled}
          placeholder={t("tasks.customFields.selectPlaceholder", { name: field.name })}
        />
      )

    case "DROPDOWN":
      return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
            <SelectValue placeholder={t("tasks.customFields.selectPlaceholder", { name: field.name })} />
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
          <label htmlFor={`cf-dialog-${field.id}`} className="text-sm text-foreground cursor-pointer">
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
          placeholder={t("tasks.customFields.enterPlaceholder", { name: field.name })}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )
  }
}
