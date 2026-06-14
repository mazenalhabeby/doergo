"use client"

import { useState, useEffect, useCallback, useRef, memo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Type,
  Hash,
  Calendar,
  ChevronDown,
  CheckSquare,
  Link2,
  Mail,
  Loader2,
} from "lucide-react"

import {
  customFieldsApi,
  type CustomFieldDefinition,
  type CustomFieldValue,
  type CustomFieldType,
} from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ============================================================================
// Helper: debounce
// ============================================================================

function useDebounce(callback: () => void, delay: number) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedFn = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(callback, delay)
  }, [callback, delay])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return debouncedFn
}

// ============================================================================
// Field Icon
// ============================================================================

function getFieldIcon(type: CustomFieldType) {
  const icons: Record<CustomFieldType, typeof Type> = {
    TEXT: Type,
    NUMBER: Hash,
    DATE: Calendar,
    DROPDOWN: ChevronDown,
    CHECKBOX: CheckSquare,
    URL: Link2,
    EMAIL: Mail,
  }
  return icons[type] || Type
}

// ============================================================================
// Individual Field Renderer
// ============================================================================

const FieldInput = memo(function FieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition
  value: string
  onChange: (value: string) => void
}) {
  const Icon = getFieldIcon(definition.type)

  switch (definition.type) {
    case "TEXT":
      return (
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder={`Enter ${definition.name.toLowerCase()}...`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    case "NUMBER":
      return (
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="number"
            className="pl-9 h-9 text-sm"
            placeholder="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    case "DATE":
      return (
        <Input
          type="date"
          className="h-9 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case "DROPDOWN":
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={`Select ${definition.name.toLowerCase()}...`} />
          </SelectTrigger>
          <SelectContent>
            {(definition.options || []).map((opt) => (
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
            checked={value === "true"}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
          />
          <span className="text-sm text-muted-foreground">{definition.name}</span>
        </div>
      )

    case "URL":
      return (
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="url"
            className="pl-9 h-9 text-sm"
            placeholder="https://..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    case "EMAIL":
      return (
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="email"
            className="pl-9 h-9 text-sm"
            placeholder="email@example.com"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )

    default:
      return (
        <Input
          className="h-9 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
})

// ============================================================================
// Custom Fields Section
// ============================================================================

export function CustomFieldsSection({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient()
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const [initialized, setInitialized] = useState(false)

  // Fetch definitions
  const { data: definitions, isLoading: loadingDefs } = useQuery({
    queryKey: ["customFieldDefinitions"],
    queryFn: () => customFieldsApi.listDefinitions(),
  })

  // Fetch task values
  const { data: taskValues, isLoading: loadingValues } = useQuery({
    queryKey: ["customFieldValues", taskId],
    queryFn: () => customFieldsApi.getTaskValues(taskId),
    enabled: !!taskId,
  })

  // Initialize local values from server
  useEffect(() => {
    if (taskValues && !initialized) {
      const valueMap: Record<string, string> = {}
      taskValues.forEach((v) => {
        valueMap[v.definitionId] = v.value
      })
      setLocalValues(valueMap)
      setInitialized(true)
    }
  }, [taskValues, initialized])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (values: { definitionId: string; value: string }[]) =>
      customFieldsApi.setTaskValues(taskId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customFieldValues", taskId] })
    },
  })

  // Build save payload from localValues
  const saveValues = useCallback(() => {
    const values = Object.entries(localValues)
      .filter(([, value]) => value !== "")
      .map(([definitionId, value]) => ({ definitionId, value }))
    if (values.length > 0) {
      saveMutation.mutate(values)
    }
  }, [localValues, saveMutation])

  const debouncedSave = useDebounce(saveValues, 800)

  const handleChange = useCallback(
    (definitionId: string, value: string) => {
      setLocalValues((prev) => ({ ...prev, [definitionId]: value }))
      debouncedSave()
    },
    [debouncedSave],
  )

  // Filter to active definitions only
  const activeDefinitions = (definitions || []).filter((d) => d.isActive)

  if (loadingDefs || loadingValues) {
    return null
  }

  // No custom fields configured
  if (activeDefinitions.length === 0) {
    return null
  }

  return (
    <div>
      {saveMutation.isPending && (
        <div className="flex justify-end mb-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        </div>
      )}
      <div className="space-y-4">
        {activeDefinitions
          .sort((a, b) => a.position - b.position)
          .map((def) => (
            <div key={def.id} className="space-y-1.5">
              {def.type !== "CHECKBOX" && (
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  {def.name}
                  {def.isRequired && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
              )}
              <FieldInput
                definition={def}
                value={localValues[def.id] || ""}
                onChange={(value) => handleChange(def.id, value)}
              />
            </div>
          ))}
      </div>
    </div>
  )
}


