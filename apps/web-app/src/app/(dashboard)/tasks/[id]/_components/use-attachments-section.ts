"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { taskAttachmentsApi, uploadToS3, type Attachment } from "@/lib/api"

const MAX_FILE_SIZE = 20 * 1024 * 1024

 // 20MB
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]

interface UploadingFile {
  id: string
  file: File
  progress: number
}

/** AttachmentsSection's state and handlers — everything before its markup, moved here unchanged. */
export function useAttachmentsSection({
  taskId,
  initialAttachments,
}: Pick<{
  taskId: string
  /**
   * The attachments the task detail response already carried. Without this the
   * section refetched the exact rows the page had just paid for — findOne
   * includes them — so opening a task fetched its attachments twice.
   */
  initialAttachments?: Attachment[]
}, 'taskId' | 'initialAttachments'>) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: keys.tasks.attachments(taskId),
    queryFn: () => taskAttachmentsApi.getAttachments(taskId),
    // Seeded from the detail payload, so opening a task costs no extra request;
    // uploads and deletes still invalidate and refetch. Mirrors how the subtasks
    // section is wired.
    initialData: initialAttachments,
    staleTime: 30000,
  })

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      taskAttachmentsApi.delete(taskId, attachmentId),
    onSuccess: () => {
      toast.success(t("tasks.attachments.deleted"))
      queryClient.invalidateQueries({ queryKey: keys.tasks.attachments(taskId) })
      queryClient.invalidateQueries({ queryKey: keys.tasks.timeline(taskId) })
      // The section header counts task.attachments, so the task has to know too.
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId) })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uploadFile = useCallback(
    async (file: File) => {
      // Validate
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("tasks.attachments.exceedsLimit", { name: file.name }))
        return
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(t("tasks.attachments.unsupportedType", { name: file.name }))
        return
      }

      const uploadId = `${Date.now()}-${Math.random()}`
      setUploadingFiles((prev) => [
        ...prev,
        { id: uploadId, file, progress: 0 },
      ])

      try {
        // 1. Get presigned URL
        const presigned = await taskAttachmentsApi.getPresignedUrl(
          taskId,
          file.name,
          file.type,
        )
        if (!presigned) throw new Error(t("tasks.attachments.failedUploadUrl"))

        // 2. Upload to S3
        await uploadToS3(presigned.uploadUrl, file, (progress) => {
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === uploadId ? { ...f, progress } : f)),
          )
        })

        // 3. Confirm upload
        await taskAttachmentsApi.confirmUpload(taskId, {
          fileName: file.name,
          fileKey: presigned.fileKey,
          fileUrl: presigned.fileUrl,
          fileType: file.type,
          fileSize: file.size,
        })

        toast.success(t("tasks.attachments.uploaded", { name: file.name }))
        queryClient.invalidateQueries({ queryKey: keys.tasks.attachments(taskId) })
        queryClient.invalidateQueries({ queryKey: keys.tasks.timeline(taskId) })
        // The section header counts task.attachments, so the task has to know too.
        queryClient.invalidateQueries({ queryKey: keys.tasks.detail(taskId) })
      } catch (err) {
        toast.error(
          t("tasks.attachments.uploadFailed", { name: file.name, error: err instanceof Error ? err.message : t("common.error") }),
        )
      } finally {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId))
      }
    },
    [taskId, queryClient],
  )

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach(uploadFile)
    },
    [uploadFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const isUploading = uploadingFiles.length > 0

  return {
    t,
    i18n,
    fileInputRef,
    isDragging,
    uploadingFiles,
    deleteTarget,
    setDeleteTarget,
    attachments,
    isLoading,
    deleteMutation,
    handleFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isUploading,
  }
}
