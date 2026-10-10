"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { AlertCircle, Loader2, Upload } from "lucide-react"
import { workflowsApi } from "@/lib/api"
import type { workflowAdvice } from "@hbcfield/shared/client"
import { CustomFieldsManager } from "@/components/custom-fields-manager"
import { Label } from "@/components/ui/label"

/**
 * Advice, the task type's fields and "Offer to library" — only for a SAVED
 * task type, because each piece needs one that exists.
 */
export function SavedWorkflowExtras({
  workflowId,
  advice,
}: {
  workflowId: string
  advice: ReturnType<typeof workflowAdvice>
}) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  return (
    <>
      {advice.length > 0 && (
        <div className="space-y-1">
          {advice.map((a) => (
            <p key={a.code} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              {a.message}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {t("workflows.builder.fields", "Fields collected on this task type")}
        </Label>
        <div className="rounded-lg border border-border bg-background p-2.5">
          <CustomFieldsManager workflowId={workflowId} />
        </div>
      </div>

      {/* Offering it SUBMITS it — a curator reads it before any other
          organization is offered it. The wording has to say so. */}
      <button
        type="button"
        disabled={submitting}
        title={t("workflows.page.submitHint", "Offer this flow to other organizations. It is reviewed first.")}
        onClick={async () => {
          setSubmitting(true)
          try {
            const r = await workflowsApi.submitToLibrary(workflowId)
            notify.success(
              r?.resubmitted
                ? t("workflows.page.toast.resubmitted", "Updated — it is waiting to be reviewed.")
                : t("workflows.page.toast.submitted", "Sent for review. It reaches other organizations once approved."),
            )
          } catch (e) {
            notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
          } finally {
            setSubmitting(false)
          }
        }}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {submitting ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
        {t("workflows.page.submitToLibrary", "Offer to library")}
      </button>
    </>
  )
}
