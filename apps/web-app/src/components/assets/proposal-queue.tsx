"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check, ChevronDown, ChevronRight, FileText, Loader2, PackagePlus, Sparkles,
  UserMinus, UserPlus, X,
} from "lucide-react"

import {
  assetsApi,
  type AssetCategory, type AssetProposal, type ContractFields, type ContractPreview,
} from "@/lib/api"
import { normalizeKindShape, canManageAssetsIn } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { initials } from "./holder-picker"

/**
 * Pages members have sent in, waiting on somebody responsible.
 *
 * ⚠️ The driver never created anything. They photographed the agreement they
 * were handed at a desk and it landed here — which is the whole gap this
 * closes, because the alternative is the paper living in a door pocket until
 * somebody types it in March.
 *
 * Sits at the top of the Assets page and renders NOTHING when it is empty: a
 * permanent empty panel teaches people to stop looking at that part of the
 * screen, and this is the one part that must keep being looked at.
 *
 * A Space Manager sees it too. The server narrows the list to what they may
 * decide (`mayReviewProposal` in shared: the kind's workspace, or the member's
 * while no kind is chosen), so nothing here filters proposals — only the kinds
 * offered, below.
 *
 * ⚠️ ON A WORKSPACE'S TAB, ONLY THAT WORKSPACE'S (`spaceId`). A manager of two
 * depots was shown the other depot's van here too, in a kind this tab's picker
 * does not offer — a decision the screen could not make. The server narrows by
 * `proposalInSpace`, the same rule asked of one place; without `spaceId` (the
 * org-wide Assets page) the whole in-scope queue comes back, which is where a
 * page with a kind in no workspace, or from a member assigned nowhere, is found.
 */
export function ProposalQueue({ kinds, spaceId }: { kinds: AssetCategory[]; spaceId?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [reviewing, setReviewing] = useState<AssetProposal | null>(null)

  const q = useQuery({
    // Prefixed by the shared key, so a decision invalidates every queue at once.
    queryKey: ["asset-proposals-pending", spaceId ?? "all"],
    queryFn: () => assetsApi.getPendingProposals(spaceId),
    // Somebody sends one from a rental desk; the office has this page open.
    refetchInterval: 120_000,
  })

  const proposals = q.data ?? []
  if (q.isLoading || proposals.length === 0) return null

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.04]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {t("proposals.waiting", "{{count}} documents look like new assets", { count: proposals.length })}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-primary/25 p-3">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} onReview={() => setReviewing(p)} />
          ))}
        </div>
      )}

      <ReviewDialog
        proposal={reviewing}
        kinds={kinds}
        onClose={() => setReviewing(null)}
      />
    </div>
  )
}

function ProposalRow({ proposal, onReview }: { proposal: AssetProposal; onReview: () => void }) {
  const { t } = useTranslation()
  const who = proposal.raisedBy
    ? `${proposal.raisedBy.firstName ?? ""} ${proposal.raisedBy.lastName ?? ""}`.trim()
    : t("expenses.someone", "Someone")
  const name = nameOf(proposal.fields)

  return (
    <button
      onClick={onReview}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {initials(who)}
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
          {t("proposals.sentBy", "Sent by {{who}}", { who })} · {new Date(proposal.createdAt).toLocaleDateString()}
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

/**
 * One page, and what accepting it would do.
 *
 * The preview is asked for as soon as a kind is chosen, and it is the SERVER's:
 * it names the custody that would close and the record that would be retired,
 * computed from what the member holds right now — never from anything stored
 * when the page was uploaded three weeks ago.
 */
function ReviewDialog({
  proposal, kinds, onClose,
}: {
  proposal: AssetProposal | null
  kinds: AssetCategory[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()

  /*
    Only kinds a member can hold, in a workspace THIS reviewer manages. Accepting
    runs the contract flow, which refuses a kind outside their workspaces as not
    found — offering one would be a choice that can only fail. Same filter as
    the contract dialog; an org-wide manager keeps every kind.
  */
  const usable = kinds.filter((k) => {
    const shape = normalizeKindShape(k.config)
    return shape.holder.enabled && shape.holder.members && canManageAssetsIn(user, k.spaceId)
  })

  const [categoryId, setCategoryId] = useState("")
  const [fields, setFields] = useState<ContractFields>({})
  const [retire, setRetire] = useState(true)
  const [note, setNote] = useState("")
  const [refusing, setRefusing] = useState(false)

  // Keyed on the proposal so opening a second one starts clean rather than
  // carrying the first one's corrections onto somebody else's vehicle.
  const [seeded, setSeeded] = useState<string | null>(null)
  if (proposal && seeded !== proposal.id) {
    setSeeded(proposal.id)
    setCategoryId(proposal.categoryId ?? (usable.length === 1 ? usable[0]!.id : ""))
    setFields(proposal.fields ?? {})
    setRetire(true)
    setNote("")
    setRefusing(false)
  }

  const holderUserId = proposal?.holderUserId ?? proposal?.raisedById ?? ""

  const previewQ = useQuery({
    queryKey: ["proposal-preview", proposal?.id, categoryId, retire, JSON.stringify(fields)],
    queryFn: () => assetsApi.previewContract({ categoryId, holderUserId, fields, retireReplaced: retire }),
    enabled: !!proposal && !!categoryId && !!holderUserId,
  })
  const preview: ContractPreview | undefined = previewQ.data ?? undefined

  const done = () => {
    qc.invalidateQueries({ queryKey: ["asset-proposals-pending"] })
    qc.invalidateQueries({ queryKey: ["space-asset-kinds"] })
    onClose()
  }

  const accept = useMutation({
    mutationFn: () => assetsApi.acceptProposal(proposal!.id, { categoryId, fields, retireReplaced: retire }),
    onSuccess: () => { notify.success(t("proposals.accepted", "Added and handed over.")); done() },
    onError: (e: Error) => notify.error(e.message),
  })

  const reject = useMutation({
    mutationFn: () => assetsApi.rejectProposal(proposal!.id, note.trim() || undefined),
    onSuccess: () => { notify.success(t("proposals.refused", "Refused.")); done() },
    onError: (e: Error) => notify.error(e.message),
  })

  const openDocument = useMutation({
    mutationFn: () => assetsApi.getProposalDocumentUrl(proposal!.id),
    onSuccess: (d) => { if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer") },
    onError: (e: Error) => notify.error(e.message),
  })

  if (!proposal) return null
  const who = proposal.holder ?? proposal.raisedBy
  const whoName = who ? `${who.firstName ?? ""} ${who.lastName ?? ""}`.trim() : ""

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("proposals.title", "A new asset to confirm")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("proposals.intro", "{{who}} sent this in. Nothing has been created.", { who: whoName })}
          </p>

          {proposal.hasDocument && (
            <Button variant="outline" size="sm" onClick={() => openDocument.mutate()} disabled={openDocument.isPending}>
              {openDocument.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <FileText className="mr-1.5 h-3.5 w-3.5" />}
              {t("proposals.openDocument", "Open the page")}
            </Button>
          )}

          <div className="space-y-1.5">
            <Label>{t("contract.kind", "What kind of thing")}</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="">{t("contract.pickKind", "Choose…")}</option>
              {usable.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t("contract.fRegistration", "Registration")} value={fields.registration ?? ""}
              onChange={(v) => setFields((f) => ({ ...f, registration: v }))} />
            <Field label={t("contract.fVin", "VIN / serial")} value={fields.vin ?? ""}
              onChange={(v) => setFields((f) => ({ ...f, vin: v }))} />
            <Field label={t("contract.fManufacturer", "Make")} value={fields.manufacturer ?? ""}
              onChange={(v) => setFields((f) => ({ ...f, manufacturer: v }))} />
            <Field label={t("contract.fModel", "Model")} value={fields.model ?? ""}
              onChange={(v) => setFields((f) => ({ ...f, model: v }))} />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
            <Checkbox checked={retire} onCheckedChange={(v) => setRetire(v === true)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium text-foreground">{t("contract.retire", "Retire what it replaces")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("contract.retireHint", "Keeps its history and its jobs, and stops it being billed.")}
              </span>
            </span>
          </label>

          {/*
            The consequences, from the server, recomputed for THIS moment. The
            step that names the vehicle being closed is the one the reviewer is
            really here for.
          */}
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("custody.whatHappens", "What happens")}
            </p>
            {!categoryId ? (
              <p className="text-sm text-muted-foreground">{t("proposals.pickKindFirst", "Choose a type to see.")}</p>
            ) : previewQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : preview ? (
              <ol className="space-y-1.5 text-sm">
                {preview.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-foreground">
                    <StepIcon kind={step.kind} />
                    <span>
                      {step.kind === "create" && t("contract.stepCreate", "Creates “{{name}}” in {{kind}}.", {
                        name: step.asset.name, kind: usable.find((k) => k.id === categoryId)?.name ?? "",
                      })}
                      {step.kind === "hand-over" && t("contract.stepHand", "Hands it to {{name}} from today.", { name: whoName })}
                      {step.kind === "close" && t("contract.stepClose", "Closes their custody of {{name}} — later costs stop landing on it.", {
                        name: step.assetName,
                      })}
                      {step.kind === "retire" && t("contract.stepRetire", "Retires {{name}}. Its history stays; it stops being billed.", {
                        name: step.assetName,
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {t("proposals.cannot", "That cannot be created as it stands.")}
              </p>
            )}
          </div>

          {refusing && (
            <div className="space-y-1.5">
              <Label>{t("proposals.why", "Why not (the member sees this)")}</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("proposals.whyPh", "That is the old contract…")}
                maxLength={300}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {refusing ? (
            <>
              <Button variant="ghost" onClick={() => setRefusing(false)}>{t("common.back", "Back")}</Button>
              <Button variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate()}>
                {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("proposals.refuse", "Refuse it")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setRefusing(true)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> {t("proposals.refuse", "Refuse it")}
              </Button>
              <Button
                disabled={!preview?.canApply || accept.isPending}
                onClick={() => accept.mutate()}
              >
                {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Check className="mr-1.5 h-3.5 w-3.5" /> {t("proposals.accept", "Add it")}</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What to call it, in the same order the shared rule uses. */
function nameOf(f: ContractFields): string {
  return f.name || f.registration || f.serial || [f.manufacturer, f.model].filter(Boolean).join(" ")
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="mt-1 h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
      />
    </div>
  )
}

function StepIcon({ kind }: { kind: string }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0"
  if (kind === "create") return <PackagePlus className={cn(cls, "text-primary")} />
  if (kind === "hand-over") return <UserPlus className={cn(cls, "text-emerald-600 dark:text-emerald-400")} />
  if (kind === "retire") return <PackagePlus className={cn(cls, "rotate-180 text-muted-foreground")} />
  return <UserMinus className={cn(cls, "text-amber-600 dark:text-amber-400")} />
}
