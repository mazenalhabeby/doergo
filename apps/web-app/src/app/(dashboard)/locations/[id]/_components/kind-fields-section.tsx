"use client"

import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"
import { KIND_SHAPE_LIMITS, type KindShape } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** More info: the fields every record of this kind is prompted for — floor, rooms, rent, plate, serial. */
export function KindFieldsSection({
  fields,
  setShape,
}: {
  fields: KindShape["fields"]
  setShape: React.Dispatch<React.SetStateAction<KindShape>>
}) {
  const { t } = useTranslation()
  const set = <K extends keyof KindShape>(k: K, v: KindShape[K]) => setShape((s) => ({ ...s, [k]: v }))
  const setField = (i: number, label: string) =>
    setShape((s) => ({ ...s, fields: s.fields.map((f, idx) => (idx === i ? { label } : f)) }))
  const atFieldCap = fields.length >= KIND_SHAPE_LIMITS.maxFields

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-muted-foreground">
            {t("assetKinds.fields", "What you record about each one")}
          </Label>
          <p className="text-[11px] text-muted-foreground/70">
            {t("assetKinds.fieldsHint", "Floor, rooms, rent, plate, serial — whatever this kind needs.")}
          </p>
        </div>
        <button
          type="button"
          disabled={atFieldCap}
          onClick={() => set("fields", [...fields, { label: "" }])}
          className={
            "inline-flex items-center gap-1 text-xs font-medium text-primary " +
            "hover:underline disabled:opacity-40 disabled:no-underline"
          }
        >
          <Plus className="h-3.5 w-3.5" /> {t("assetRecords.addField", "Add field")}
        </button>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={f.label}
                onChange={(e) => setField(i, e.target.value)}
                placeholder={t("assetKinds.fieldLabel", "Floor")}
                maxLength={KIND_SHAPE_LIMITS.maxLabel}
              />
              <button
                type="button"
                onClick={() =>
                  set(
                    "fields",
                    fields.filter((_, idx) => idx !== i),
                  )
                }
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                aria-label={t("common.remove", "Remove")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
