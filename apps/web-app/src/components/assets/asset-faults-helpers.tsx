"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { assetsApi, type AssetListRow } from "@/lib/api"
import { type KindList } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/** AssetFaults's module-level helpers, moved here unchanged so its sections can read them too. */
/**
 * Add or change one fault code.
 *
 * The Part field is a PICKER over the kind's catalogue, not a box to type a
 * code into. Typed by hand it drifts — a transposed digit, a renamed part — and
 * the technician standing at the machine gets "not in the parts catalogue" at
 * the moment they least need it.
 */
export function FaultForm({
  assetId, list, existing, partOptions, linkCol, onDone, onCancel,
}: {
  assetId: string
  list: KindList
  existing?: AssetListRow
  partOptions: { code: string; label: string }[]
  /** The column that points at another table, if this one has any. */
  linkCol: string | null
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {}
    for (const c of list.columns) start[c.label] = existing?.values?.[c.label] ?? ""
    return start
  })

  const set = (col: string, v: string) => setValues((s) => ({ ...s, [col]: v }))

  const save = useMutation({
    mutationFn: () =>
      existing
        ? assetsApi.updateRow(assetId, existing.id, values)
        : assetsApi.addRow(assetId, list.label, values),
    onSuccess: onDone,
    onError: (e: Error) => notify.error(e.message),
  })

  const filled = Object.values(values).some((v) => v.trim())

  return (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {list.columns.map((c) => {
          const isPart = linkCol && c.label === linkCol
          return (
            <div key={c.label} className={cn(c.label.toLowerCase() === "safety" && "sm:col-span-2")}>
              <label className="text-[11px] text-muted-foreground">{c.label}</label>
              {isPart && partOptions.length > 0 ? (
                // Chosen from the catalogue, so the link always resolves.
                <select
                  value={values[c.label] ?? ""}
                  onChange={(e) => set(c.label, e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">{t("assetFaults.noPart", "— no part —")}</option>
                  {partOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code}{o.label ? ` · ${o.label}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  className="mt-1 h-9"
                  value={values[c.label] ?? ""}
                  onChange={(e) => set(c.label, e.target.value)}
                  placeholder={c.label}
                />
              )}
            </div>
          )
        })}
      </div>

      {linkCol && partOptions.length === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {t("assetFaults.noCatalogue", "No parts catalogue on this kind yet — add one and its codes can be picked here.")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3.5 w-3.5" /> {t("common.cancel", "Cancel")}
        </Button>
        <Button size="sm" disabled={!filled || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {t("common.save", "Save")}
        </Button>
      </div>
    </div>
  )
}
