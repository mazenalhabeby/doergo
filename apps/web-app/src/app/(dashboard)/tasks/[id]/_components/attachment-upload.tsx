"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useRef } from "react"
import { errorMessage } from "@/lib/errors"
import { useQueryClient } from "@tanstack/react-query"
import { Upload, Loader2 } from "lucide-react"
import { reportAttachmentsApi, uploadToS3 } from "@/lib/api"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

/** Adds before/after photos to a service report (drop or pick; presign → S3 → confirm). */
export function AttachmentUpload({ reportId, taskId }: { reportId: string; taskId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadType, setUploadType] = useState<"BEFORE" | "AFTER">("AFTER")
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]

  const uploadFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t("tasks.serviceReport.upload.acceptedTypes"))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("tasks.serviceReport.upload.sizeError"))
      return
    }

    setIsUploading(true)
    try {
      // Step 1: Get presigned URL
      const presigned = await reportAttachmentsApi.getPresignedUrl(reportId, file.name, file.type)
      if (!presigned) throw new Error(t("tasks.attachments.failedUploadUrl"))

      // Step 2: Upload. `uploadToS3` rejects on a non-2xx; the bare fetch this
      // replaces resolved on a 403 and went straight on to confirm nothing.
      await uploadToS3(presigned.uploadUrl, file)

      // Step 3: Confirm upload
      await reportAttachmentsApi.confirmUpload(reportId, {
        type: uploadType,
        fileName: file.name,
        fileKey: presigned.fileKey,
        fileUrl: presigned.fileUrl,
        fileType: file.type,
        fileSize: file.size,
      })

      toast.success(t("tasks.serviceReport.upload.success"))
      queryClient.invalidateQueries({ queryKey: keys.tasks.report(taskId) })
    } catch (e) {
      toast.error(errorMessage(e, t("tasks.serviceReport.upload.failed")))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) uploadFile(file)
    },
    [uploadType],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
      // Reset input so the same file can be selected again
      e.target.value = ""
    },
    [uploadType],
  )

  return (
    <div className="mt-4 space-y-3">
      {/* Type toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("tasks.serviceReport.upload.uploadAs")}</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setUploadType("BEFORE")}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              uploadType === "BEFORE" ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            {t("tasks.serviceReport.before")}
          </button>
          <button
            type="button"
            onClick={() => setUploadType("AFTER")}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              uploadType === "AFTER" ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            {t("tasks.serviceReport.after")}
          </button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragOver(false)
        }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer",
          isDragOver ? "border-blue-400 bg-blue-50" : "border-border bg-muted hover:border-border",
          isUploading && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        <div className="flex flex-col items-center justify-center py-6 px-4">
          {isUploading ? (
            <>
              <Loader2 className="size-5 text-blue-500 animate-spin mb-2" />
              <p className="text-xs text-muted-foreground font-medium">{t("tasks.serviceReport.upload.uploading")}</p>
            </>
          ) : (
            <>
              <Upload className="size-5 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground font-medium">{t("tasks.serviceReport.upload.dropHint")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("tasks.serviceReport.upload.sizeHint")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
