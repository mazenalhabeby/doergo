"use client"

import type { Dispatch, ReactNode, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DetailRow {
  label: string
  value: string
}

/**
 * Free label/value rows on a record ("More info" on a client or an apartment):
 * a heading with Add field, the hint while there are none, then one editable
 * row each with its own remove button.
 */
export function DetailFields({
  title,
  hint,
  details,
  setDetails,
}: {
  title: ReactNode
  hint: ReactNode
  details: DetailRow[]
  setDetails: Dispatch<SetStateAction<DetailRow[]>>
}) {
  const { t } = useTranslation()
  const setDetail = (i: number, k: keyof DetailRow, v: string) =>
    setDetails((d) => d.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <button
          type="button"
          onClick={() => setDetails((d) => [...d, { label: "", value: "" }])}
          className={"inline-flex items-center gap-1 text-xs font-medium text-primary " + "hover:underline"}>
          <Plus className="h-3.5 w-3.5" /> {t("customers.addField", "Add field")}
        </button>
      </div>
      {details.length === 0 ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : (
        <div className="space-y-2">
          {details.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={d.label}
                onChange={(e) => setDetail(i, "label", e.target.value)}
                placeholder={t("customers.fieldLabel", "Label")}
                className="w-2/5"
              />
              <Input
                value={d.value}
                onChange={(e) => setDetail(i, "value", e.target.value)}
                placeholder={t("customers.fieldValue", "Value")}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setDetails((arr) => arr.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
