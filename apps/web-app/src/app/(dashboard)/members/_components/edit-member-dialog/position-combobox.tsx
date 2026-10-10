"use client"

import { useState, memo } from "react"
import { useTranslation } from "react-i18next"
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
  CommandSeparator,
} from "@/components/ui/command"

// ── Constants ────────────────────────────────────────────────────────────────

const POSITION_SUGGESTIONS = [
  "Technician", "Driver", "Accountant", "HR Manager", "Sales Representative",
  "Office Manager", "Warehouse Worker", "Service Engineer", "Project Manager",
  "Designer", "Developer", "Customer Support", "Delivery Driver", "Inspector",
]

export const PositionCombobox = memo(function PositionCombobox({
  value,
  onChange,
  usedPositions,
}: {
  value: string
  onChange: (value: string) => void
  usedPositions: string[]
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)

  const unusedSuggestions = POSITION_SUGGESTIONS.filter(
    (s) => !usedPositions.some((u) => u.toLowerCase() === s.toLowerCase()),
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 font-normal text-sm"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || t("members.memberEditor.positionPlaceholder")}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <div className="p-2 pb-1">
            <CommandInput
              placeholder={t("members.memberEditor.searchOrType")}
              value={inputValue}
              onValueChange={(v) => {
                setInputValue(v)
                onChange(v)
              }}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto overflow-x-hidden overscroll-contain" onWheel={(e) => e.stopPropagation()}>
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded-sm"
                  onClick={() => {
                    onChange(inputValue)
                    setOpen(false)
                  }}
                >
                  {t("members.memberEditor.useQuery", { query: inputValue })}
                </button>
              </CommandEmpty>
              {usedPositions.length > 0 && (
                <CommandGroup heading={t("members.memberEditor.usedInOrg")}>
                  {usedPositions.map((pos) => (
                    <CommandItem
                      key={`used-${pos}`}
                      value={pos}
                      onSelect={() => {
                        onChange(pos)
                        setInputValue(pos)
                        setOpen(false)
                      }}
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", value === pos ? "opacity-100" : "opacity-0")} />
                      {pos}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {unusedSuggestions.length > 0 && (
                <>
                  {usedPositions.length > 0 && <CommandSeparator />}
                  <CommandGroup heading={t("members.memberEditor.suggestions")}>
                    {unusedSuggestions.map((pos) => (
                      <CommandItem
                        key={`sug-${pos}`}
                        value={pos}
                        onSelect={() => {
                          onChange(pos)
                          setInputValue(pos)
                          setOpen(false)
                        }}
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", value === pos ? "opacity-100" : "opacity-0")} />
                        {pos}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
})
