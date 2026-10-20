"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Check, Loader2, X } from "lucide-react"
import { parseOpeningBalances } from "@hbcfield/shared/client"
import { leaveLedgerApi, type OpeningBalanceMatch } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * "Paste from file": a table copied out of the old system — one person per line,
 * `email or name ; used ; carried`. The SERVER matches the people (an id is never
 * read from pasted text); matched rows fill the table, and every line it could
 * not place is listed with its line number, never guessed.
 */
export function OpeningPastePanel({
  onMatched,
  onClose,
}: {
  /** Fills the table; returns how many rows it filled. */
  onMatched: (rows: OpeningBalanceMatch["rows"]) => number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [result, setResult] = useState<(OpeningBalanceMatch & { filled: number }) | null>(null)

  // Read locally first only to know there is something to send — the server decides who is who.
  const readable = parseOpeningBalances(text).rows.length > 0

  const match = useMutation({
    mutationFn: () => leaveLedgerApi.matchOpening(text),
    onSuccess: (m) => {
      const filled = onMatched(m.rows)
      setResult({ ...m, filled })
    },
    onError: (e: Error) => notify.error(serverErrorMessage(e, t) || t("common.error")),
  })

  const problems = result
    ? [
        ...result.unmatched.map((u) => ({ line: u.line, text: u.text, reason: u.reason, why: "unmatched" as const })),
        ...result.errors.map((u) => ({ line: u.line, text: u.text, reason: undefined, why: "error" as const })),
      ].sort((a, b) => a.line - b.line)
    : []

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("leaveLedger.opening.pasteTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("leaveLedger.opening.pasteHint")}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t("common.close", "Close")}>
          <X className="size-4" />
        </Button>
      </div>
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null) }}
        placeholder={"mark.weber@example.com; 10; 0\nSarah Wagner; 6; 2"}
        className="font-mono text-[12.5px]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => match.mutate()} disabled={!readable || match.isPending}>
          {match.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {t("leaveLedger.opening.match")}
        </Button>
        {result && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" />
            {t("leaveLedger.opening.filled", { count: result.filled })}
          </span>
        )}
      </div>

      {problems.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            {t("leaveLedger.opening.notPlaced", { count: problems.length })}
          </p>
          <ul className="space-y-1">
            {problems.map((p) => (
              <li key={`${p.why}-${p.line}`} className="flex gap-2 text-xs text-muted-foreground">
                <span className="shrink-0 font-mono tabular-nums">{t("leaveLedger.opening.line", { line: p.line })}</span>
                <span className="min-w-0 flex-1 truncate font-mono">{p.text}</span>
                <span className="shrink-0">
                  {p.why === "error"
                    ? t("leaveLedger.opening.unreadable")
                    : p.reason === "AMBIGUOUS"
                      ? t("leaveLedger.opening.ambiguous")
                      : p.reason === "DUPLICATE"
                        ? t("leaveLedger.opening.duplicate")
                        : t("leaveLedger.opening.unmatched")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
