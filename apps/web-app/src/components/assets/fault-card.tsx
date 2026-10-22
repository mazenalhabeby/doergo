"use client"

import { useTranslation } from "react-i18next"
import { AlertTriangle, Package, Pencil, ShieldAlert, Trash2, Wrench } from "lucide-react"
import { type AssetListRow } from "@/lib/api"
import { type KindList } from "@hbcfield/shared/client"
import { AssetRaiseJob } from "@/components/assets/asset-raise-job"

/**
 * One fault code as the technician reads it: the code and its meaning, cause and fix, the part it
 * needs (resolved out of the kind's catalogue) and the safety note — with a button to raise the job.
 */
export function FaultCard({
  assetId,
  assetName,
  spaceId,
  code,
  meaning,
  cause,
  fix,
  safety,
  partCode,
  part,
  parts,
  codeCol,
  catalogueTruncated,
  partsFetched,
  onEdit,
  onRemove,
}: {
  assetId: string
  assetName: string
  spaceId?: string | null
  code: string
  meaning: string
  cause: string
  fix: string
  safety: string
  partCode: string
  part: AssetListRow | undefined
  /** The catalogue the part code points into. */
  parts: KindList | null
  codeCol: string | null
  catalogueTruncated: boolean
  /** How many catalogue rows were fetched. */
  partsFetched: number
  onEdit: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="group rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={
            "rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-sm font-semibold " +
            "text-amber-600 dark:text-amber-400"
          }
        >
          {code || "—"}
        </span>
        <span className="text-sm font-medium text-foreground">{meaning}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {/* The whole point of standing here with a code: turn it
                        into the job, with what it means and what to do already
                        written down. */}
          <AssetRaiseJob assetId={assetId} assetName={assetName} spaceId={spaceId} faultCode={{ code, meaning, fix }} />
          <button
            onClick={onEdit}
            className={
              "rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
              "hover:text-foreground group-hover:opacity-100"
            }
            aria-label={t("common.edit", "Edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className={
              "rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
              "hover:text-destructive group-hover:opacity-100"
            }
            aria-label={t("common.remove", "Remove")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
        {cause && (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="text-foreground">{t("assetFaults.cause", "Cause")}:</span> {cause}
            </span>
          </p>
        )}
        {fix && (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="text-foreground">{t("assetFaults.fix", "Fix")}:</span> {fix}
            </span>
          </p>
        )}
      </div>

      {partCode && (
        <p className="mt-2 flex items-center gap-1.5 text-sm">
          <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs text-foreground">{partCode}</span>
          {part ? (
            // Resolved out of the kind's own catalogue, so the
            // technician sees what the code means without leaving.
            <span className="text-muted-foreground">
              {/* In the catalogue's own column order. Object.entries
                            follows insertion order, which put Qty before Name
                            and read as nonsense. */}
              {parts!.columns
                .filter((c) => c.label !== codeCol)
                .map((c) => (part.values?.[c.label] ?? "").trim())
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              {catalogueTruncated
                ? t("assetFaults.partUnchecked", "not among the first {{count}} — search the catalogue", {
                    count: partsFetched,
                  })
                : t("assetFaults.partMissing", "not in the catalogue")}
            </span>
          )}
        </p>
      )}

      {safety && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {safety}
        </p>
      )}
    </div>
  )
}
