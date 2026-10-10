"use client"

import { useTranslation } from "react-i18next"
import { Users } from "lucide-react"
import { type DraftDocumentRow } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"

/*
  Who signs, when the route leaves it open.

  A route names ROLES, and a role usually resolves to exactly one person — that
  step never reaches this panel. It appears only where the answer is genuinely
  ambiguous: a member with two people who can approve for them, an organisation
  with several representatives. Asking then is not friction, it is the only
  moment anybody knows the answer.

  Deliberately not a default-to-the-first-candidate: picking a signer for
  somebody and being wrong sends a document to the wrong desk, and the person it
  actually needed never learns it existed.
*/
/** One answer to "who signs this step" — a person on file, or one typed in. */
export type SignerChoice = { userId?: string; customerId?: string; email?: string; name?: string }

export function SignerQuestions({
  drafts,
  choices,
  onChoose,
}: {
  drafts: DraftDocumentRow[]
  choices: Record<string, Record<number, SignerChoice>>
  onChoose: (documentId: string, order: number, who: SignerChoice) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="w-full rounded-xl border border-border/80 bg-card p-4">
      <div className="mb-3 flex items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">{t("documents.issue.signers.title")}</p>
          <p className="text-xs text-muted-foreground">{t("documents.issue.signers.hint")}</p>
        </div>
      </div>

      <div className="space-y-3">
        {drafts.map((d) => (
          <div key={d.id} className="rounded-lg border border-border/60 bg-accent/30 p-3">
            <p className="mb-2 text-sm font-medium">
              {personName(d.user)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{d.type.label}</span>
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {(d.routeSteps ?? [])
                .filter((s) => s.candidates.length !== 1 || s.role === "CUSTOMER")
                .map((s) => {
                  const picked = choices[d.id]?.[s.order]
                  const value = picked?.userId ?? picked?.customerId ?? ""
                  return (
                    <label key={s.order} className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`documents.types.route.roles.${s.role}`, { defaultValue: s.role })}
                      </span>
                      <select
                        value={picked?.email ? "__manual__" : value}
                        onChange={(e) => {
                          if (e.target.value === "__manual__") {
                            onChoose(d.id, s.order, { email: "", name: "" })
                            return
                          }
                          const c = s.candidates.find((x) => x.id === e.target.value)
                          if (!c) return
                          onChoose(
                            d.id,
                            s.order,
                            c.kind === "USER" ? { userId: c.id } : { customerId: c.id },
                          )
                        }}
                        className="h-9 appearance-none rounded-md border border-border bg-background px-3 text-sm"
                      >
                        <option value="" disabled>
                          {t("documents.issue.signers.choose")}
                        </option>
                        {s.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.email ? ` · ${c.email}` : ""}
                          </option>
                        ))}
                        {/*
                          Always offered, whatever the space could suggest.

                          A closed list is exactly useless the one time somebody
                          must send a document to a person who is not a member,
                          not a CRM client and not a space's contact — which is
                          an ordinary Tuesday, not an edge case.
                        */}
                        <option value="__manual__">
                          {t("documents.issue.signers.manual", "Someone else…")}
                        </option>
                      </select>
                      {picked?.email !== undefined && !picked.userId && !picked.customerId && (
                        <span className="mt-1 flex flex-col gap-1">
                          <input
                            value={picked.name ?? ""}
                            onChange={(e) =>
                              onChoose(d.id, s.order, { ...picked, name: e.target.value })
                            }
                            placeholder={t("documents.issue.signers.manualName", "Their name")}
                            className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                          />
                          <input
                            type="email"
                            value={picked.email ?? ""}
                            onChange={(e) =>
                              onChoose(d.id, s.order, { ...picked, email: e.target.value })
                            }
                            placeholder={t("documents.issue.signers.manualEmail", "Their email address")}
                            className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                          />
                        </span>
                      )}
                    </label>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
