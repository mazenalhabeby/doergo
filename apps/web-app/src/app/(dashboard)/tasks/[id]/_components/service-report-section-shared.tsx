"use client"

import { keys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { reportAttachmentsApi } from "@/lib/api"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

/** What the components of service-report-section.tsx share (moved here unchanged). */
export interface ServiceReportSectionProps {
  taskId: string
  taskStatus: string
}

export function SignatureDisplay({ label, signature, name }: { label: string; signature?: string | null; name?: string | null }) {
  const { t } = useTranslation()
  if (!signature) {
    return (
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
        <div className="h-24 bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("tasks.serviceReport.noSignature")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {/* Signatures are black ink on a transparent background — always render on
          white (like paper) so they stay visible in dark mode too. */}
      <div className="bg-white rounded-lg p-2 border border-border">
        <img
          src={signature}
          alt={t("tasks.serviceReport.signatureAlt", { label })}
          loading="lazy"
          decoding="async"
          className="h-20 w-full object-contain"
        />
        {name && (
          <p className="text-xs text-center text-neutral-600 mt-1">{name}</p>
        )}
      </div>
    </div>
  )
}

export function AttachmentDeleteButton({
  reportId,
  attachmentId,
  taskId,
}: {
  reportId: string
  attachmentId: string
  taskId: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => reportAttachmentsApi.delete(reportId, attachmentId),
    onSuccess: () => {
      toast.success(t("tasks.serviceReport.photoRemoved"))
      queryClient.invalidateQueries({ queryKey: keys.tasks.report(taskId) })
    },
    onError: (e: Error) => toast.error(e.message || t("tasks.serviceReport.photoRemoveFailed")),
  })

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (confirm(t("tasks.serviceReport.removePhotoConfirm"))) deleteMutation.mutate()
      }}
      disabled={deleteMutation.isPending}
      className={"absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 " +
        "group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"}
    >
      {deleteMutation.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <X className="size-3" />
      )}
    </button>
  )
}
