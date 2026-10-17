"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { assetsApi, type AssetCategory } from "@/lib/api"
import {
  normalizeKindShape,
  KIND_SHAPE_LIMITS,
  type KindShape,
  type MoneyDirection,
  type KindColumn,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"

/** AssetKindDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetKindDialog({
  spaceId,
  existing,
  onSaved,
  trigger,
}: Pick<{
  spaceId: string
  existing?: AssetCategory
  onSaved: () => void
  trigger: React.ReactNode
}, 'spaceId' | 'existing' | 'onSaved' | 'trigger'>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const start = normalizeKindShape(existing?.config)
  const [name, setName] = useState(existing?.name ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [shape, setShape] = useState<KindShape>(start)

  const set = <K extends keyof KindShape>(k: K, v: KindShape[K]) => setShape((s) => ({ ...s, [k]: v }))
  const setHolder = (patch: Partial<KindShape["holder"]>) =>
    setShape((s) => ({ ...s, holder: { ...s.holder, ...patch } }))
  const setField = (i: number, label: string) =>
    setShape((s) => ({ ...s, fields: s.fields.map((f, idx) => (idx === i ? { label } : f)) }))
  const setMoney = (patch: Partial<KindShape["money"]>) =>
    setShape((s) => ({ ...s, money: { ...s.money, ...patch } }))
  const setList = (i: number, patch: { label?: string; columns?: KindColumn[]; display?: "table" | "cards"; shared?: boolean }) =>
    setShape((s) => ({ ...s, lists: s.lists.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const setCategory = (i: number, patch: { label?: string; direction?: MoneyDirection }) =>
    setShape((s) => ({
      ...s,
      money: {
        ...s.money,
        categories: s.money.categories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
      },
    }))

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        config: normalizeKindShape(shape) as unknown as Record<string, unknown>,
      }
      return existing
        ? assetsApi.updateCategory(existing.id, input)
        : assetsApi.createCategory({ ...input, spaceId })
    },
    onSuccess: () => {
      notify.success(existing ? t("common.saved", "Saved") : t("assetKinds.created", "{{name}} added", { name: name.trim() }))
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) {
      setName(existing?.name ?? "")
      setDescription(existing?.description ?? "")
      setShape(normalizeKindShape(existing?.config))
    }
    setOpen(next)
  }

  const atFieldCap = shape.fields.length >= KIND_SHAPE_LIMITS.maxFields

  return {
    t,
    open,
    setOpen,
    name,
    setName,
    description,
    setDescription,
    shape,
    setShape,
    set,
    setHolder,
    setField,
    setMoney,
    setList,
    setCategory,
    save,
    reset,
    atFieldCap,
  }
}

/** What AssetKindDialog and its sections read. */
export type AssetKindDialogState = ReturnType<typeof useAssetKindDialog>
