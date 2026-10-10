"use client"

import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { type CustomFieldDefinition } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
              {value ? format(new Date(value), "MMM d, yyyy") : t("tasks.customFields.selectPlaceholder", { name: field.name })}
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
          placeholder={t("tasks.customFields.enterPlaceholder", { name: field.name })}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )
  }
}
