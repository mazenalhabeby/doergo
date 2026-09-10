"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowRight, Check, FileText, Loader2, PackagePlus, UserMinus, UserPlus, Wand2,
} from "lucide-react"

import {
  assetsApi, organizationsApi,
  type AssetCategory, type ContractFields, type ContractPreview, type ContractReading,
} from "@/lib/api"
import { normalizeKindShape, kindHolderLabel } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { memberName } from "./holder-picker"

/**
 * A contract in, a record out — with the two things people forget done for them.
 *
 * The four screens this replaces: create the vehicle, type its plate and model,
 * assign it, then find the old one and retire it. The last two are the ones
 * that get skipped, and skipping them is not tidy-up debt — it means every fuel
 * receipt from that day lands against the car nobody is driving.
 *
 * ⚠️ IT PROPOSES. Three stages, and the middle one exists so nothing is ever
 * created from a reading nobody looked at:
 *
 *   1. Paste the text.       The reader fills the boxes.
 *   2. Correct the boxes.    Green was read, amber was guessed.
 *   3. Read the consequences, then confirm.
 *
 * ⚠️ And the consequences are the SERVER'S. This screen renders what
 * `/contracts/preview` returned and posts back the same reading — it never
 * says "retire asset a-456", because a client that could name the record to
 * retire could retire any record.
 */

type Stage = "paste" | "fields" | "confirm"

const FIELD_KEYS = ["registration", "vin", "manufacturer", "model", "startsOn", "endsOn"] as const
type FieldKey = (typeof FIELD_KEYS)[number]

export function ContractDialog({
  kinds,
  trigger,
  onCreated,
}: {
  /** The workspace's kinds. Only those whose records are held by a member. */
  kinds: AssetCategory[]
  trigger: React.ReactNode
  onCreated: (assetId: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>("paste")

  const [text, setText] = useState("")
  const [reading, setReading] = useState<ContractReading | null>(null)
  const [fields, setFields] = useState<ContractFields>({})
  const [categoryId, setCategoryId] = useState("")
  const [holderUserId, setHolderUserId] = useState("")
  const [retire, setRetire] = useState(true)
  const [preview, setPreview] = useState<ContractPreview | null>(null)

  /*
    Only kinds whose records are HELD BY A MEMBER. A contract hands something to
    somebody; a kind with no holder has nobody to hand it to, and offering it
    would produce a refusal three clicks later with no way to act on it.
  */
  const usable = kinds.filter((k) => {
    const shape = normalizeKindShape(k.config)
    return shape.holder.enabled && shape.holder.members
  })
  const kind = usable.find((k) => k.id === categoryId)
  const shape = normalizeKindShape(kind?.config)

  const membersQ = useQuery({
    queryKey: ["org-members-assignable"],
    queryFn: () => organizationsApi.getMembers({ limit: 100 }),
    enabled: open,
  })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")

  const read = useMutation({
    mutationFn: () => assetsApi.readContract(text),
    onSuccess: (r) => {
      if (!r) return
      setReading(r)
      setFields({
        registration: r.registration?.value ?? "",
        vin: r.vin?.value ?? "",
        manufacturer: r.manufacturer?.value ?? "",
        model: r.model?.value ?? "",
        startsOn: r.startsOn?.value ?? "",
        endsOn: r.endsOn?.value ?? "",
      })
      setStage("fields")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const ask = useMutation({
    mutationFn: () =>
      assetsApi.previewContract({ categoryId, holderUserId, fields: clean(fields), retireReplaced: retire }),
    onSuccess: (p) => { if (p) { setPreview(p); setStage("confirm") } },
    onError: (e: Error) => notify.error(e.message),
  })

  const apply = useMutation({
    mutationFn: () =>
      assetsApi.applyContract({ categoryId, holderUserId, fields: clean(fields), retireReplaced: retire }),
    onSuccess: (r) => {
      if (!r) return
      notify.success(t("contract.created", "{{name}} is on the books and handed over.", { name: r.name }))
      reset(false)
      onCreated(r.assetId)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) {
      setStage("paste"); setText(""); setReading(null); setFields({})
      setCategoryId(usable[0]?.id ?? ""); setHolderUserId(""); setRetire(true); setPreview(null)
    }
    setOpen(next)
  }

  const confidence = (key: FieldKey): "certain" | "likely" | undefined =>
    (reading?.[key] as { confidence?: "certain" | "likely" } | undefined)?.confidence

  const named = !!(fields.name?.trim() || fields.registration?.trim() || fields.vin?.trim() ||
    (fields.manufacturer?.trim() && fields.model?.trim()))
  const ready = !!categoryId && !!holderUserId && named

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
              placeholder={t("contract.pastePh", "Hersteller: Ford\nModell: Transit Custom\nAmtliches Kennzeichen: GM-472 DK\nMietbeginn: 15.09.2026")}
              className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-primary"
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
                {members.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
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
                          ? memberName(members.find((m) => m.id === holderUserId)!)
                          : "",
                      })}
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
            </div>

            {/*
              A term that begins later than today. Said plainly rather than
              silently obeyed: a custody starting in the future would leave the
              vehicle held by nobody in between, and every receipt in the gap
              would fall out of both custodies.
            */}
            {preview.startClamped && (
              <p className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                {t("contract.clamped", "The term starts later than today, so custody is recorded from today — nothing can be held by nobody in between. The term’s own dates are kept on the record.")}
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

/** Blank strings must not reach the server as empty values it then stores. */
function clean(fields: ContractFields): ContractFields {
  const out: ContractFields = {}
  for (const [k, v] of Object.entries(fields)) {
    const trimmed = typeof v === "string" ? v.trim() : v
    if (trimmed) (out as Record<string, string>)[k] = trimmed as string
  }
  return out
}

/** One box, coloured by whether the reader could prove what it put in it. */
function ReadField({
  label, value, confidence, onChange,
}: {
  label: string
  value: string
  confidence?: "certain" | "likely"
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className={cn(
      "rounded-xl border p-2.5",
      !confidence ? "border-border"
        : confidence === "certain" ? "border-emerald-500/45" : "border-amber-500/50",
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {confidence && (
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide",
            confidence === "certain"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          )}>
            {confidence === "certain" ? t("scan.found", "FOUND") : t("scan.check", "CHECK")}
          </span>
        )}
      </div>
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
