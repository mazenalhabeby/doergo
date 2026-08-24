"use client"

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Pencil, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { dateLocale } from "@/lib/format-date"

interface InlineEditFieldProps {
  /** `undefined` means the same as null here — the field is simply not set. */
  value: string | number | null | undefined
  onSave: (value: string) => Promise<void> | void
  type?: "text" | "textarea" | "number" | "date" | "select"
  disabled?: boolean
  placeholder?: string
  options?: { value: string; label: string; color?: string }[]
  renderDisplay?: (value: string | number | null | undefined) => ReactNode
  className?: string
}

export function InlineEditField({
  value,
  onSave,
  type = "text",
  disabled = false,
  placeholder,
  options,
  renderDisplay,
  className,
}: InlineEditFieldProps) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t("tasks.inlineEdit.empty")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ""))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Sync draft when value changes externally
  useEffect(() => {
    if (!editing) setDraft(String(value ?? ""))
  }, [value, editing])

  // Focus input on edit start
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [editing])

  const startEdit = useCallback(() => {
    if (disabled) return
    setDraft(String(value ?? ""))
    setEditing(true)
  }, [disabled, value])

  const cancel = useCallback(() => {
    setDraft(String(value ?? ""))
    setEditing(false)
  }, [value])

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === String(value ?? "")) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      // Revert on error
      setDraft(String(value ?? ""))
    } finally {
      setSaving(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cancel() }
    if (e.key === "Enter" && type !== "textarea") { e.preventDefault(); save() }
    if (e.key === "Enter" && e.metaKey && type === "textarea") { e.preventDefault(); save() }
  }, [cancel, save, type])

  // ─── Select type ──────────────────────────────────────────────────────
  if (type === "select" && options) {
    if (disabled) {
      const selected = options.find(o => o.value === String(value ?? ""))
      return (
        <span className={cn("text-sm text-foreground", className)}>
          {renderDisplay ? renderDisplay(value) : selected?.label || <span className="text-muted-foreground">{resolvedPlaceholder}</span>}
        </span>
      )
    }
    return (
      <Select
        value={String(value ?? "__none__")}
        onValueChange={async (v) => {
          const saveValue = v === "__none__" ? "" : v
          setSaving(true)
          try { await onSave(saveValue) } finally { setSaving(false) }
        }}
        disabled={saving}
      >
        <SelectTrigger className={cn("h-8 text-sm border-none shadow-none px-0 hover:bg-muted/50 transition-colors", className)}>
          <SelectValue placeholder={resolvedPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-2">
                {opt.color && <span className="size-2 rounded-full" style={{ backgroundColor: opt.color }} />}
                {opt.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // ─── Date type ────────────────────────────────────────────────────────
  if (type === "date") {
    if (disabled) {
      return (
        <span className={cn("text-sm text-foreground", className)}>
          {renderDisplay ? renderDisplay(value) : (value ? new Date(String(value)).toLocaleDateString(dateLocale(), { month: "short", day: "numeric", year: "numeric" }) : <span className="text-muted-foreground">{resolvedPlaceholder}</span>)}
        </span>
      )
    }
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn("text-sm text-foreground hover:bg-muted/50 px-1.5 py-0.5 -mx-1.5 rounded transition-colors group flex items-center gap-1.5", className)}>
            {value ? new Date(String(value)).toLocaleDateString(dateLocale(), { month: "short", day: "numeric", year: "numeric" }) : <span className="text-muted-foreground">{resolvedPlaceholder}</span>}
            <Pencil className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ? new Date(String(value)) : undefined}
            onSelect={async (date) => {
              if (date) {
                setSaving(true)
                try { await onSave(date.toISOString()) } finally { setSaving(false) }
              }
            }}
          />
        </PopoverContent>
      </Popover>
    )
  }

  // ─── Display mode (text, textarea, number) ────────────────────────────
  if (!editing) {
    const displayValue = renderDisplay ? renderDisplay(value) : (value != null && String(value) !== "" ? String(value) : null)

    return (
      <button
        type="button"
        onClick={startEdit}
        disabled={disabled}
        className={cn(
          "text-left text-sm transition-colors rounded group flex items-center gap-1.5 min-w-0",
          disabled
            ? "cursor-default text-foreground"
            : "hover:bg-muted/50 px-1.5 py-0.5 -mx-1.5 cursor-pointer text-foreground",
          type === "textarea" && "items-start w-full",
          className,
        )}
      >
        <span className={cn("min-w-0", type === "textarea" ? "whitespace-pre-wrap break-words flex-1" : "truncate")}>
          {displayValue || <span className="text-muted-foreground">{resolvedPlaceholder}</span>}
        </span>
        {!disabled && (
          <Pencil className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" />
        )}
      </button>
    )
  }

  // ─── Edit mode ────────────────────────────────────────────────────────
  if (type === "textarea") {
    return (
      <div className={cn("space-y-2", className)}>
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
          rows={4}
          className="text-sm resize-none ring-2 ring-blue-500/20 border-blue-300"
          disabled={saving}
        />
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={save} disabled={saving}>
            <Check className="size-3 mr-1" /> {t("common.save")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={cancel}>
            <X className="size-3 mr-1" /> {t("common.cancel")}
          </Button>
          <span className="text-[10px] text-muted-foreground ml-auto">{t("tasks.inlineEdit.cmdEnterToSave")}</span>
        </div>
      </div>
    )
  }

  return (
    <Input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type === "number" ? "number" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={save}
      className={cn("h-8 text-sm ring-2 ring-blue-500/20 border-blue-300", className)}
      disabled={saving}
    />
  )
}
