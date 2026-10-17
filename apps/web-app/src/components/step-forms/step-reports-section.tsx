"use client"

import { keys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ClipboardCheck } from "lucide-react"
import { personName, parseStoredStepForm, workflowStatusLabel, type StepFormField, type StepFormAnswerValue } from "@hbcfield/shared/client"

import { tasksApi, type TaskStepSubmission } from "@/lib/api"
import { stepFieldLabel } from "@/lib/step-forms"
import { CollapsibleSection } from "@/app/(dashboard)/tasks/[id]/_components/collapsible-section"

interface StatusLike {
  key: string
  name?: string
  nameKey?: string | null
}

/**
 * The job's reports — one per move into a step that asked something.
 *
 * Rendered from each submission's own SNAPSHOT of the form, never from today's
 * workflow: a question renamed or removed since does not change what was asked
 * and answered then. Hidden when the job has none.
 */
export function StepReportsSection({ taskId, workflowStatuses }: { taskId: string; workflowStatuses?: ReadonlyArray<StatusLike> | null }) {
  const { t } = useTranslation()
  const { data: submissions = [] } = useQuery({
    queryKey: keys.tasks.submissions(taskId),
    queryFn: () => tasksApi.getSubmissions(taskId),
    // Photo and signature links are signed and short-lived.
    staleTime: 5 * 60_000,
  })

  if (!submissions.length) return null

  return (
    <div data-tour="task-step-reports">
      <CollapsibleSection id="step-reports" icon={ClipboardCheck} title={t("stepForm.report.title", "Reports")} count={submissions.length}>
        <div className="space-y-4">
          {submissions.map((s) => (
            <StepReport key={s.id} submission={s} workflowStatuses={workflowStatuses} />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}

/** One submission, from its snapshot. Exported for tests. */
export function StepReport(
  { submission, workflowStatuses }: { submission: TaskStepSubmission; workflowStatuses?: ReadonlyArray<StatusLike> | null }) {
  const { t, i18n } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const form = parseStoredStepForm(submission.form)
  const status = workflowStatuses?.find((st) => st.key === submission.statusKey)
  const stepName = status?.name
    ? workflowStatusLabel({ name: status.name, nameKey: status.nameKey ?? null }, (k, o) => t(k, o))
    : submission.statusKey
  const who = personName(submission.submittedBy) || t("stepForm.report.someone", "Someone")
  const when = new Date(submission.submittedAt)
  const whenText = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" })

  const fileUrl = (id: string) => {
    const f = submission.files?.[id]
    return f ? (f.url ?? f.fileUrl) : undefined
  }

  const answer = (field: StepFormField, v: StepFormAnswerValue | undefined) => {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "") {
      return <span className="text-muted-foreground">{t("stepForm.report.notAnswered", "Not answered")}</span>
    }
    switch (field.type) {
      case "yesno":
        return <span>{v === true ? t("stepForm.dialog.yes", "Yes") : t("stepForm.dialog.no", "No")}</span>
      case "number":
        return <span>{typeof v === "number" ? v.toLocaleString(i18n.language) : String(v)}</span>
      case "date": {
        const d = typeof v === "string" ? new Date(`${v}T12:00:00`) : null
        return <span>{d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(i18n.language, { dateStyle: "medium" }) : String(v)}</span>
      }
      case "photos": {
        const ids = Array.isArray(v) ? v : []
        return (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {ids.map((id) => {
              const url = fileUrl(id)
              return url ? (
                <a
                  key={id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={submission.files[id]?.fileName ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                </a>
              ) : (
                <div
                  key={id}
                  className={"flex aspect-square items-center justify-center rounded-lg border " +
                    "border-dashed text-[10px] text-muted-foreground"}>
                  {t("stepForm.report.fileGone", "Removed")}
                </div>
              )
            })}
          </div>
        )
      }
      case "signature": {
        const url = typeof v === "string" ? fileUrl(v) : undefined
        return url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={stepFieldLabel(field, tr)} loading="lazy" decoding="async" className="h-20 rounded-md border bg-white p-1" />
        ) : (
          <span className="text-muted-foreground">{t("stepForm.report.fileGone", "Removed")}</span>
        )
      }
      case "note":
        return <p className="whitespace-pre-wrap">{String(v)}</p>
      default:
        return <span>{String(v)}</span>
    }
  }

  return (
    <article className="rounded-xl border bg-muted/10 p-4" data-testid="step-report">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{stepName}</h4>
        <span className="text-xs text-muted-foreground">
          {t("stepForm.report.byWhen", { who, when: whenText, defaultValue: "{{who}} · {{when}}" })}
        </span>
      </header>
      {form ? (
        <dl className="space-y-3">
          {form.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">{stepFieldLabel(field, tr)}</dt>
              <dd className="text-sm">{answer(field, submission.answers?.[field.id])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">{t("stepForm.report.unreadable", "This report cannot be shown.")}</p>
      )}
    </article>
  )
}
