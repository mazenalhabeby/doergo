"use client"

import {
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Wand2,
} from "lucide-react"

import { type AssetCategory } from "@/lib/api"
import { kindHolderLabel, personName } from "@hbcfield/shared/client"
import { StepIcon } from "./contract-parts"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { useContractDialog } from "./use-contract-dialog"
import { ReadField } from "./contract-dialog-helpers"

export function ContractDialog({
  kinds,
  spaceId,
  trigger,
  onCreated,
}: {
  /** The workspace's kinds. Only those whose records are held by a member. */
  kinds: AssetCategory[]
  /** The workspace this is opened from — whose roster a space-scoped manager picks from. */
  spaceId?: string
  trigger: React.ReactNode
  onCreated: (assetId: string) => void
}) {
  const {
    t,
    open,
    stage,
    setStage,
    text,
    setText,
    fields,
    setFields,
    categoryId,
    setCategoryId,
    holderUserId,
    setHolderUserId,
    retire,
    setRetire,
    preview,
    usable,
    kind,
    shape,
    members,
    read,
    ask,
    apply,
    reset,
    confidence,
    named,
    ready,
  } = useContractDialog({ kinds, spaceId, trigger, onCreated })

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {t("contract.title", "From a contract")}
          </DialogTitle>
        </DialogHeader>

        {/* ── 1. The text ─────────────────────────────────────────────────── */}
        {stage === "paste" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("contract.pasteHint", "Paste the agreement. It fills in what it can find and creates nothing until you say so.")}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={t(
                "contract.pastePh",
                ("Hersteller: Ford\nModell: Transit Custom\nAmtliches Kennzeichen: GM-472 " + "DK\nMietbeginn: 15.09.2026"))}
              className={"w-full rounded-xl border border-border bg-background p-3 font-mono " +
                "text-xs text-foreground outline-none focus:border-primary"}
            />
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStage("fields")}>
                {t("contract.skipRead", "Fill it in myself")}
              </Button>
              <Button disabled={!text.trim() || read.isPending} onClick={() => read.mutate()}>
                {read.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Wand2 className="mr-1.5 h-3.5 w-3.5" /> {t("contract.read", "Read it")}</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── 2. What it made of it ───────────────────────────────────────── */}
        {stage === "fields" && (
          <div className="space-y-4">
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
              {usable.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("contract.noKinds", "No type in this workspace is held by a member — a contract has nobody to hand it to.")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{kindHolderLabel(shape, t("contract.holder", "Who gets it"))}</Label>
              <select
                value={holderUserId}
                onChange={(e) => setHolderUserId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="">{t("contract.pickHolder", "Choose…")}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{personName(m)}</option>)}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ReadField label={t("contract.fRegistration", "Registration")} value={fields.registration ?? ""}
                confidence={confidence("registration")} onChange={(v) => setFields((f) => ({ ...f, registration: v }))} />
              <ReadField label={t("contract.fVin", "VIN / serial")} value={fields.vin ?? ""}
                confidence={confidence("vin")} onChange={(v) => setFields((f) => ({ ...f, vin: v }))} />
              <ReadField label={t("contract.fManufacturer", "Make")} value={fields.manufacturer ?? ""}
                confidence={confidence("manufacturer")} onChange={(v) => setFields((f) => ({ ...f, manufacturer: v }))} />
              <ReadField label={t("contract.fModel", "Model")} value={fields.model ?? ""}
                confidence={confidence("model")} onChange={(v) => setFields((f) => ({ ...f, model: v }))} />
              <ReadField label={t("contract.fStarts", "Term starts")} value={fields.startsOn ?? ""}
                confidence={confidence("startsOn")} onChange={(v) => setFields((f) => ({ ...f, startsOn: v }))} />
              <ReadField label={t("contract.fEnds", "Term ends")} value={fields.endsOn ?? ""}
                confidence={confidence("endsOn")} onChange={(v) => setFields((f) => ({ ...f, endsOn: v }))} />
            </div>

            {!named && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("contract.needName", "Nothing here identifies it yet — a registration, a VIN, or a make and model.")}
              </p>
            )}

            {/*
              A record must never be created from a reading nobody looked at, so
              this step cannot be skipped — but it is one click, and the box
              below is the whole reason the flow is worth having.
            */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
              <Checkbox checked={retire} onCheckedChange={(v) => setRetire(v === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium text-foreground">{t("contract.retire", "Retire what it replaces")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("contract.retireHint", "Keeps its history and its jobs, and stops it being billed.")}
                </span>
              </span>
            </label>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStage("paste")}>{t("common.back", "Back")}</Button>
              <Button disabled={!ready || ask.isPending} onClick={() => ask.mutate()}>
                {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <>{t("contract.next", "See what happens")} <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── 3. The consequences ─────────────────────────────────────────── */}
        {stage === "confirm" && preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("custody.whatHappens", "What happens")}
              </p>
              <ol className="space-y-2 text-sm">
                {preview.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-foreground">
                    <StepIcon kind={step.kind} />
                    <span>
                      {step.kind === "create" && t("contract.stepCreate", "Creates “{{name}}” in {{kind}}.", {
                        name: step.asset.name, kind: kind?.name ?? "",
                      })}
                      {step.kind === "hand-over" && t("contract.stepHand", "Hands it to {{name}} from today.", {
                        name: members.find((m) => m.id === holderUserId)
                          ? personName(members.find((m) => m.id === holderUserId)!)
                          : "",
                      })}
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
            </div>

            {/*
              A term that begins later than today. Said plainly rather than
              silently obeyed: a custody starting in the future would leave the
              vehicle held by nobody in between, and every receipt in the gap
              would fall out of both custodies.
            */}
            {preview.startClamped && (
              <p
                className={"rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-xs " +
                  "text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 " +
                  "dark:text-amber-200"}>
                {t(
                  "contract.clamped",
                  ("The term starts later than today, so custody is recorded from today — " +
                    "nothing can be held by nobody in between. The term’s own dates are kept " +
                    "on the record."))}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStage("fields")}>{t("common.back", "Back")}</Button>
              <Button disabled={!preview.canApply || apply.isPending} onClick={() => apply.mutate()}>
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Check className="mr-1.5 h-3.5 w-3.5" /> {t("contract.apply", "Do it")}</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
