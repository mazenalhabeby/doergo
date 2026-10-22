"use client"

import { formatDurationSeconds, personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Clock, User, Wrench, Camera, PenTool, AlertCircle } from "lucide-react"
import { reportsApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useTranslation } from "react-i18next"
import { SignatureDisplay } from "./signature-display"
import { PhotoGallery } from "./photo-gallery"
import { PartsTable } from "./parts-table"
import { AttachmentUpload } from "./attachment-upload"

interface ServiceReportSectionProps {
  taskId: string
  taskStatus: string
}

export function ServiceReportSection({ taskId, taskStatus }: ServiceReportSectionProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  // Only fetch report for completed/closed tasks
  const shouldFetch = taskStatus === "COMPLETED" || taskStatus === "CLOSED"

  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: keys.tasks.report(taskId),
    queryFn: () => reportsApi.getTaskReport(taskId),
    enabled: shouldFetch,
  })

  // Don't render anything if task is not completed
  if (!shouldFetch) {
    return null
  }

  if (isLoading) {
    return (
      <div>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="size-5 text-green-500" />
          <span className="text-base font-semibold text-foreground">{t("tasks.serviceReport.jobCompleted")}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="size-4" />
          <p>{t("tasks.serviceReport.noReport")}</p>
        </div>
      </div>
    )
  }

  const attachments = report.attachments || []
  const partsUsed = report.partsUsed || []

  return (
    <div>
      {/*
        No card, no title — CollapsibleSection draws both. What stays is the
        part it does not say: that the job is done, and when.
      */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-500" />
          <span className="text-sm font-medium text-foreground">{t("tasks.serviceReport.jobCompleted")}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("tasks.serviceReport.completedOn", {
            date: new Date(report.completedAt).toLocaleDateString(i18n.language, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          })}
        </span>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-foreground mb-2">{t("tasks.serviceReport.summary")}</h4>
        <div className="bg-green-50 border-l-4 border-green-500 rounded-r-lg p-4">
          <p className="text-sm text-green-900">{report.summary}</p>
        </div>
      </div>

      {/* Work Performed */}
      {report.workPerformed && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-foreground mb-2">{t("tasks.serviceReport.workPerformed")}</h4>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm text-foreground whitespace-pre-line">{report.workPerformed}</p>
          </div>
        </div>
      )}

      {/* Duration & Employee */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-muted rounded-lg p-4 flex items-center gap-3">
          <Clock className="size-5 text-blue-500" />
          <div>
            <p className="text-xs text-muted-foreground">{t("common.duration")}</p>
            <p className="text-sm font-semibold text-foreground">{formatDurationSeconds(report.workDuration)}</p>
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4 flex items-center gap-3">
          <User className="size-5 text-blue-500" />
          <div>
            <p className="text-xs text-muted-foreground">{t("tasks.serviceReport.employee")}</p>
            <p className="text-sm font-semibold text-foreground">
              {report.completedBy ? personName(report.completedBy) : t("tasks.serviceReport.unknown")}
            </p>
          </div>
        </div>
      </div>

      {/* Before & After Photos */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Camera className="size-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-foreground">{t("tasks.serviceReport.beforeAfterPhotos")}</h4>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              {t("tasks.serviceReport.before")}
            </p>
            <PhotoGallery
              attachments={attachments}
              type="BEFORE"
              reportId={report.id}
              taskId={taskId}
              canDelete={isAdmin}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              {t("tasks.serviceReport.after")}
            </p>
            <PhotoGallery
              attachments={attachments}
              type="AFTER"
              reportId={report.id}
              taskId={taskId}
              canDelete={isAdmin}
            />
          </div>
        </div>

        {/* Upload dropzone for admins */}
        {isAdmin && <AttachmentUpload reportId={report.id} taskId={taskId} />}
      </div>

      {/* Parts Used */}
      {partsUsed.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">{t("tasks.serviceReport.partsUsed")}</h4>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <PartsTable parts={partsUsed} />
          </div>
        </div>
      )}

      {/* Signatures */}
      {(report.technicianSignature || report.customerSignature) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <PenTool className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">{t("tasks.serviceReport.signatures")}</h4>
          </div>
          <div className="flex gap-4">
            <SignatureDisplay
              label={t("tasks.serviceReport.employee")}
              signature={report.technicianSignature}
              name={report.completedBy ? personName(report.completedBy) : undefined}
            />
            <SignatureDisplay
              label={t("tasks.serviceReport.customer")}
              signature={report.customerSignature}
              name={report.customerName}
            />
          </div>
        </div>
      )}
    </div>
  )
}
