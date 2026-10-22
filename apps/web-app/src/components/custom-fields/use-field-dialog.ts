"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { customFieldsApi, type CustomFieldDefinition, type CustomFieldType } from "@/lib/api"

/** FieldDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useFieldDialog({
  open,
  onOpenChange,
  existingField,
  workflowId,
}: Pick<{
  open: boolean
  onOpenChange: (open: boolean) => void
  existingField: CustomFieldDefinition | null
  workflowId: string | null
}, 'open' | 'onOpenChange' | 'existingField' | 'workflowId'>) {
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
    return n.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
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

  return {
    t,
    isEditing,
    name,
    setName,
    key,
    setKey,
    type,
    setType,
    isRequired,
    setIsRequired,
    options,
    setOptions,
    newOption,
    setNewOption,
    autoKey,
    mutation,
    addOption,
  }
}

/** What FieldDialog and its sections read. */
export type FieldDialogState = ReturnType<typeof useFieldDialog>
