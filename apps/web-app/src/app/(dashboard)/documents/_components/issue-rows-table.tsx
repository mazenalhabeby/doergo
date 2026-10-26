"use client"

import { useTranslation } from "react-i18next"
import { X, FileText } from "lucide-react"
import { type DocumentTypeRow, type MatchCandidateRow } from "@/lib/api"
import { formatFileSize, personName, type DocumentCadence } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { baseTitle, titleFor, type Row } from "../_lib/issue-rows"
import { FiledAs } from "./filed-as"
import { MatchChip } from "./match-chip"
import { PeriodCell } from "./period-cell"

/** The batch under review: one row per dropped file, every match overridable. */
/** A column title — the boards' list header: small, muted, never shouting in capitals. */
const TH = "h-10 px-4 text-left text-xs font-medium text-muted-foreground"

export function IssueRowsTable({
  rows,
  candidates,
  activeType,
  uploading,
  setRow,
  setRows,
}: {
  rows: Row[]
  candidates: MatchCandidateRow[]
  activeType: DocumentTypeRow | null
  uploading: boolean
  setRow: (fileName: string, patch: Partial<Row>) => void
  setRows: React.Dispatch<React.SetStateAction<Row[]>>
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="mb-4 overflow-x-auto rounded-[22px] border border-border bg-card shadow-shell">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th className={TH}>{t("documents.issue.file")}</th>
            <th className={TH}>{t("documents.issue.member")}</th>
            <th className={TH}>{t("documents.issue.match")}</th>
            <th className={TH}>{t("documents.issue.period")}</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <tr
              key={row.fileName}
              className={cn(
                !row.userId && "bg-shell-chip",
                row.state === "failed" && "bg-shell-chip",
                row.state === "staged" && "bg-shell-accent-soft",
              )}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs text-foreground">{row.fileName}</span>
                </div>
                <div className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                  {formatFileSize(row.file.size, i18n.language)}
                </div>
                <FiledAs
                  row={row}
                  filedAs={titleFor(row, activeType, t)}
                  baseName={baseTitle(row, activeType)}
                  locked={row.state === "uploading" || row.state === "staged"}
                  onRename={(customTitle) => setRow(row.fileName, { customTitle })}
                />
                {row.state === "uploading" && (
                  <div className="mt-1 ml-6 h-1 w-32 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${row.progress * 100}%` }} />
                  </div>
                )}
                {row.error && <div className="mt-1 pl-6 text-[11px] text-shell-crit">{row.error}</div>}
              </td>

              <td className="px-4 py-2.5">
                {/*
                  A select, not a label, even for an exact match. The
                  admin can override any row without deleting and
                  re-adding the file, which is what makes reviewing a
                  thirty-row table tolerable.
                */}
                <select
                  value={row.userId ?? ""}
                  disabled={row.state === "staged" || uploading}
                  onChange={(e) =>
                    setRow(row.fileName, {
                      userId: e.target.value || null,
                      confidence: e.target.value ? "EXACT" : "UNMATCHED",
                      reason: e.target.value ? "chosen by hand" : "no member chosen",
                    })
                  }
                  aria-label={t("documents.issue.member")}
                  className={"w-full max-w-[220px] rounded border border-border bg-card px-2 py-1 " + "text-sm "}
                >
                  <option value="">{t("documents.issue.pickMember")}</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {personName(c)}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-4 py-2.5">
                <MatchChip row={row} />
              </td>

              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                <PeriodCell
                  row={row}
                  cadence={(activeType?.cadence ?? "ONE_OFF") as DocumentCadence}
                  onChange={(patch) => setRow(row.fileName, patch)}
                />
              </td>

              <td className="px-4 py-2.5">
                {row.state !== "staged" && (
                  <button
                    onClick={() => setRows((prev) => prev.filter((r) => r.fileName !== row.fileName))}
                    aria-label={t("common.remove")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
