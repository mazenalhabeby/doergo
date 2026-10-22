"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Camera, ChevronLeft, ChevronRight, ZoomIn, Loader2, X } from "lucide-react"
import { keys } from "@/lib/query-keys"
import { reportAttachmentsApi, type ReportAttachment } from "@/lib/api"
import { useTranslation } from "react-i18next"

/** A service report's photos, one at a time with arrows; removable where the viewer may delete. */
export function PhotoGallery({
  attachments,
  type,
  reportId,
  taskId,
  canDelete,
}: {
  attachments: ReportAttachment[]
  type: "BEFORE" | "AFTER"
  reportId?: string
  taskId?: string
  canDelete?: boolean
}) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showFullscreen, setShowFullscreen] = useState(false)

  const filteredAttachments = attachments.filter((a) => a.type === type)

  if (filteredAttachments.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-muted rounded-lg border-2 border-dashed border-border">
        <div className="text-center">
          <Camera className="size-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">
            {type === "BEFORE" ? t("tasks.serviceReport.noBeforePhotos") : t("tasks.serviceReport.noAfterPhotos")}
          </p>
        </div>
      </div>
    )
  }

  const current = filteredAttachments[currentIndex]!

  return (
    <div className="relative">
      <div
        className="relative h-48 bg-muted rounded-lg overflow-hidden cursor-pointer group"
        onClick={() => setShowFullscreen(true)}
      >
        <img
          src={current.fileUrl}
          alt={current.fileName}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="size-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {current.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <p className="text-xs text-white truncate">{current.caption}</p>
          </div>
        )}
        {canDelete && reportId && taskId && (
          <AttachmentDeleteButton reportId={reportId} attachmentId={current.id} taskId={taskId} />
        )}
      </div>

      {filteredAttachments.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCurrentIndex((i) => (i === 0 ? filteredAttachments.length - 1 : i - 1))
            }}
            className="absolute left-1 top-1/2 -translate-y-1/2 p-1 bg-card/80 rounded-full shadow hover:bg-card"
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCurrentIndex((i) => (i === filteredAttachments.length - 1 ? 0 : i + 1))
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-card/80 rounded-full shadow hover:bg-card"
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
            {currentIndex + 1}/{filteredAttachments.length}
          </div>
        </>
      )}

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowFullscreen(false)}
        >
          <img
            src={current.fileUrl}
            alt={current.fileName}
            decoding="async"
            className="max-w-full max-h-full object-contain"
          />
          <button
            className="absolute top-4 right-4 p-2 bg-card/20 rounded-full text-white hover:bg-card/30"
            onClick={() => setShowFullscreen(false)}
          >
            <span className="sr-only">{t("common.close")}</span>
            &times;
          </button>
        </div>
      )}
    </div>
  )
}

/** Removes one photo from the report, after a confirm. */
function AttachmentDeleteButton({
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
      className={
        "absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 " +
        "group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
      }
    >
      {deleteMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
    </button>
  )
}
