"use client"

import { useTranslation } from "react-i18next"
import { FileText } from "lucide-react"
import { type AssetProposal, type ContractFields } from "@/lib/api"
import { personInitials, personName } from "@hbcfield/shared/client"
import { ContractFieldInput } from "./contract-parts"
import { dateLocale } from "@/lib/format-date"

/** What the components of proposal-queue.tsx share (moved here unchanged). */
export function ProposalRow({ proposal, onReview }: { proposal: AssetProposal; onReview: () => void }) {
  const { t } = useTranslation()
  const who = proposal.raisedBy
    ? personName(proposal.raisedBy)
    : t("expenses.someone", "Someone")
  const name = nameOf(proposal.fields)

  return (
    <button
      onClick={onReview}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {personInitials(who)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {name || t("proposals.unnamed", "Something unnamed")}
          {[proposal.fields.manufacturer, proposal.fields.model].filter(Boolean).length > 0 && (
            <span className="text-muted-foreground">
              {" · "}{[proposal.fields.manufacturer, proposal.fields.model].filter(Boolean).join(" ")}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t("proposals.sentBy", "Sent by {{who}}", { who })} · {new Date(proposal.createdAt).toLocaleDateString(dateLocale())}
          {/* Why the reader thought this was a contract. A verdict nobody can
              argue with is one people either trust blindly or ignore. */}
          {proposal.signals?.length ? ` · ${proposal.signals.join(", ")}` : ""}
        </p>
      </div>
      {proposal.hasDocument && <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="shrink-0 text-xs font-semibold text-primary">{t("proposals.review", "Review")}</span>
    </button>
  )
}

/** What to call it, in the same order the shared rule uses. */
export function nameOf(f: ContractFields): string {
  return f.name || f.registration || f.serial || [f.manufacturer, f.model].filter(Boolean).join(" ")
}

export function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <ContractFieldInput value={value} onChange={onChange} />
    </div>
  )
}
