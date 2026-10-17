"use client"

import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AssetRecordDialogState } from "./use-asset-record-dialog"

/** Part of AssetRecordDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AssetRecordDialogFields({ vm }: { vm: AssetRecordDialogState }) {
  const {
    t,
    shape,
    addRow,
    rows,
    isFromKind,
    duplicated,
    setRow,
    removeRow,
  } = vm
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
                  {t("assetRecords.duplicateField", "Already a field with this name — rename it or it will be dropped.")}
                </p>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
