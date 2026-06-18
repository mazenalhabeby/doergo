"use client"

import { type ReactNode, useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export interface ComboboxOption {
  value: string
  label: string
  /** Extra text to match against when searching (e.g. a UTC offset). */
  keywords?: string
}

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string
  /** Search box placeholder. */
  searchPlaceholder?: string
  /** Allow typing a value that isn't in the list ("Add ..."). */
  creatable?: boolean
  /** Label for the create row; defaults to `Add "<query>"`. */
  createLabel?: (query: string) => string
  /** Cap the number of rendered rows for performance (default 80). */
  maxResults?: number
  /** Override what the (closed) trigger shows when a value is selected. */
  triggerLabel?: ReactNode
  className?: string
  contentClassName?: string
  disabled?: boolean
}

/**
 * Searchable (optionally creatable) single-select combobox.
 * One component for every "pick from a list, maybe type your own" field.
 * Focus ring is removed from the trigger so it doesn't linger after selecting.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder,
  creatable = false,
  createLabel = (q) => `Add “${q}”`,
  maxResults = 80,
  triggerLabel,
  className,
  contentClassName,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = options.find((o) => o.value === value)
  // Custom (creatable) values won't be in `options` — show the raw value then.
  const display = selected?.label ?? (value || "")

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    const list = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.value.toLowerCase().includes(q) ||
            o.keywords?.toLowerCase().includes(q),
        )
      : options
    return list.slice(0, maxResults)
  }, [options, q, maxResults])

  const showCreate =
    creatable &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === q || o.value.toLowerCase() === q)

  const pick = (v: string) => {
    onChange(v)
    setQuery("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-11 rounded-xl w-full justify-between font-normal",
            // No lingering focus ring on the trigger after the popover closes.
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            className,
          )}
        >
          <span className={cn("truncate", !display && "text-muted-foreground")}>
            {value && triggerLabel ? triggerLabel : display || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0", contentClassName || "w-[--radix-popover-trigger-width]")}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder ?? placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!showCreate && <CommandEmpty>—</CommandEmpty>}
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                  <span className="truncate">{o.label}</span>
                  {value === o.value && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem value={`__create__${query}`} onSelect={() => pick(query.trim())}>
                  {createLabel(query.trim())}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
