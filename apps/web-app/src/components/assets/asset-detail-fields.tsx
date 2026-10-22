"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DetailRow, KindShape } from "@hbcfield/shared/client"

/** A record's details: the rows its kind prompts for, and any extras the kind allows. */
export function AssetDetailFields({
  shape,
  rows,
  setRows,
}: {
  shape: KindShape
  rows: DetailRow[]
  setRows: Dispatch<SetStateAction<DetailRow[]>>
}) {
  const { t } = useTranslation()

  const setRow = (i: number, patch: Partial<DetailRow>) =>
    setRows((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((d) => [...d, { label: "", value: "" }])
  const removeRow = (i: number) => setRows((d) => d.filter((_, idx) => idx !== i))

  // Which labels this record's KIND asks for. Those rows keep their label — it
  // belongs to the kind, and editing it here would only rename it on this one
  // record while every other record kept the old name.
  const kindLabels = new Set(shape.fields.map((f) => f.label.toLowerCase()))
  const isFromKind = (label: string) => kindLabels.has(label.trim().toLowerCase())

  // A label typed twice would be silently deduped on save, and the second one's
  // value would vanish. Say so instead.
  const labelCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.label.trim().toLowerCase()
    if (k) acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  const duplicated = (label: string) => (labelCounts[label.trim().toLowerCase()] ?? 0) > 1

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{t("assetRecords.fields", "Details")}</Label>
        {/* Only when the kind allows it. Extras already on a record stay
            editable either way — switching this off must not strand data
            somebody can no longer correct. */}
        {shape.allowExtraFields && (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("assetRecords.addField", "Add field")}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {shape.allowExtraFields
            ? t("assetRecords.fieldsHint", "Anything worth recording about this one.")
            : t("assetRecords.noFields", "This kind records nothing extra.")}
        </p>
      ) : (
        rows.map((r, i) => {
          const fixed = isFromKind(r.label)
          const clash = !fixed && duplicated(r.label)
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                {fixed ? (
                  // From the kind: the label is the kind's, so it reads as
                  // a prompt rather than an editable box.
                  <span className="w-2/5 shrink-0 truncate text-sm text-muted-foreground">{r.label}</span>
                ) : (
                  <Input
                    value={r.label}
                    onChange={(e) => setRow(i, { label: e.target.value })}
                    placeholder={t("assetRecords.fieldName", "Field name")}
                    className={cn("w-2/5", clash && "border-destructive")}
                  />
                )}
                <Input
                  value={r.value}
                  onChange={(e) => setRow(i, { value: e.target.value })}
                  placeholder={t("assetRecords.fieldValue", "What it says")}
                  className="flex-1"
                />
                {fixed ? (
                  // Keeps the row heights aligned without offering a
                  // delete that would not stick — the kind re-adds it.
                  <span className="w-[30px] shrink-0" />
                ) : (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label={t("common.remove", "Remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {clash && (
                <p className="text-[11px] text-destructive">
                  {t(
                    "assetRecords.duplicateField",
                    "Already a field with this name — rename it or it will be dropped.",
                  )}
                </p>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
