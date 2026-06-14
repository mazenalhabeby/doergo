"use client"

import { useState, useCallback, memo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, ChevronDown, Check } from "lucide-react"

import { type StatusWorkflow } from "@/lib/api"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { WorkflowBuilder } from "./workflow-builder"

interface WorkflowSelectorProps {
  value: string
  onChange: (workflowId: string) => void
  workflows: StatusWorkflow[]
  disabled?: boolean
  allowCreate?: boolean
  label?: string
}

const WorkflowSelector = memo(function WorkflowSelector({
  value,
  onChange,
  workflows,
  disabled,
  allowCreate = true,
  label = "Workflow",
}: WorkflowSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)

  const selectedWorkflow = workflows.find((w) => w.id === value)
  const statusCount = selectedWorkflow?.statuses?.length || 0

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id)
      setDropdownOpen(false)
    },
    [onChange]
  )

  const handleCreateClick = useCallback(() => {
    setDropdownOpen(false)
    setShowBuilder(true)
  }, [])

  const handleCreated = useCallback(
    (newId: string) => {
      onChange(newId)
      setShowBuilder(false)
    },
    [onChange]
  )

  const handleCancelCreate = useCallback(() => {
    setShowBuilder(false)
  }, [])

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm">{label}</Label>}
      <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={selectedWorkflow ? "text-foreground" : "text-muted-foreground"}>
              {selectedWorkflow
                ? `${selectedWorkflow.name}${statusCount > 0 ? ` (${statusCount} statuses)` : ""}`
                : "Select workflow..."}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start" sideOffset={4}>
          <div className="max-h-[200px] overflow-y-auto">
            {workflows.map((wf) => {
              const count = wf.statuses?.length || 0
              const isSelected = wf.id === value
              return (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => handleSelect(wf.id)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm transition-colors hover:bg-muted ${
                    isSelected ? "bg-muted font-medium" : ""
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "border-blue-600 bg-blue-600"
                        : "border-border"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="flex-1 text-left truncate">
                    {wf.name}
                    {wf.isDefault ? " (Default)" : ""}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {count} {count === 1 ? "status" : "statuses"}
                  </span>
                </button>
              )
            })}
          </div>
          {allowCreate && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={handleCreateClick}
                className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create new workflow
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Inline builder */}
      {showBuilder && (
        <WorkflowBuilder
          mode="create"
          onCreated={handleCreated}
          onCancel={handleCancelCreate}
        />
      )}
    </div>
  )
})

export { WorkflowSelector }
export type { WorkflowSelectorProps }
