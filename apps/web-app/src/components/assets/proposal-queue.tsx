"use client"

import { useRouteAccess } from "@/hooks/use-route-access"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  X,
} from "lucide-react"

import { assetsApi, type AssetCategory, type AssetProposal } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"
import { StepIcon } from "./contract-parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { keys } from "@/lib/query-keys"
import { ProposalRow, Field } from "./proposal-queue-shared"
import { useReviewDialog } from "./use-review-dialog"

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

  const mayReview = useRouteAccess().holds("any:canManageAssets")
  const q = useQuery({
    // Prefixed by the shared key, so a decision invalidates every queue at once.
    queryKey: keys.assets.proposalsPending(spaceId ?? "all"),
    queryFn: () => assetsApi.getPendingProposals(spaceId),
    // @RequirePermissionInSpace('canManageAssets') — anyone else is only refused.
    enabled: mayReview,
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
  const {
    t,
    usable,
    categoryId,
    setCategoryId,
    fields,
    setFields,
    retire,
    setRetire,
    note,
    setNote,
    refusing,
    setRefusing,
    previewQ,
    preview,
    accept,
    reject,
    openDocument,
  } = useReviewDialog({ proposal, kinds, onClose })

  if (!proposal) return null
  const who = proposal.holder ?? proposal.raisedBy
  const whoName = personName(who)

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
                      {step.kind === "close" &&
                        t("contract.stepClose", "Closes their custody of {{name}} — later costs stop landing on it.", {
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
