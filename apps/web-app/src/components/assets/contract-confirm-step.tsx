"use client"

import { useTranslation } from "react-i18next"
import { Check, Loader2 } from "lucide-react"
import { type AssetCategory, type ContractPreview } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { StepIcon } from "./plan-step-icon"
import type { ContractMember } from "./use-contract-dialog"

/** Step 3 of reading a contract: the consequences the SERVER computed, then confirm. */
export function ContractConfirmStep({
  preview,
  kind,
  members,
  holderUserId,
  applying,
  onApply,
  onBack,
}: {
  preview: ContractPreview
  kind: AssetCategory | undefined
  members: ContractMember[]
  holderUserId: string
  applying: boolean
  onApply: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  return (
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
                {step.kind === "create" &&
                  t("contract.stepCreate", "Creates “{{name}}” in {{kind}}.", {
                    name: step.asset.name,
                    kind: kind?.name ?? "",
                  })}
                {step.kind === "hand-over" &&
                  t("contract.stepHand", "Hands it to {{name}} from today.", {
                    name: members.find((m) => m.id === holderUserId)
                      ? personName(members.find((m) => m.id === holderUserId)!)
                      : "",
                  })}
                {step.kind === "close" &&
                  t("contract.stepClose", "Closes their custody of {{name}} — later costs stop landing on it.", {
                    name: step.assetName,
                  })}
                {step.kind === "retire" &&
                  t("contract.stepRetire", "Retires {{name}}. Its history stays; it stops being billed.", {
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
          className={
            "rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-xs " +
            "text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 " +
            "dark:text-amber-200"
          }
        >
          {t(
            "contract.clamped",
            "The term starts later than today, so custody is recorded from today — " +
              "nothing can be held by nobody in between. The term’s own dates are kept " +
              "on the record.",
          )}
        </p>
      )}

      {/* The term began before what it replaces was handed over, or too long ago: custody starts later. */}
      {preview.startRaised && (
        <p
          className={
            "rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-xs " +
            "text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 " +
            "dark:text-amber-200"
          }
        >
          {t(
            "contract.raised",
            "The term starts earlier than custody can be recorded, so custody starts on {{date}}. " +
              "The term’s own dates are kept on the record.",
            { date: new Date(preview.startsAt).toLocaleDateString() },
          )}
        </p>
      )}

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back", "Back")}
        </Button>
        <Button disabled={!preview.canApply || applying} onClick={onApply}>
          {applying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" /> {t("contract.apply", "Do it")}
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
