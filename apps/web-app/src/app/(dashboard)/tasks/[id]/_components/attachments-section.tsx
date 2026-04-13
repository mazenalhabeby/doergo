"use client"

import { useState, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Paperclip,
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  X,
  Download,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { taskAttachmentsApi, uploadToS3, type Attachment } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_TYPES = [
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/")
}

interface UploadingFile {
  id: string
  file: File
  progress: number
}

export function AttachmentsSection({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["taskAttachments", taskId],
    queryFn: () => taskAttachmentsApi.getAttachments(taskId),
  })

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      taskAttachmentsApi.delete(taskId, attachmentId),
    onSuccess: () => {
      toast.success("Attachment deleted")
      queryClient.invalidateQueries({ queryKey: ["taskAttachments", taskId] })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", taskId] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uploadFile = useCallback(
    async (file: File) => {
      // Validate
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 20MB limit`)
        return
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported file type`)
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
        if (!presigned) throw new Error("Failed to get upload URL")

        // 2. Upload to S3
        await uploadToS3(presigned.uploadUrl, file, (progress) => {
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === uploadId ? { ...f, progress } : f)),
          )
        })

        // 3. Confirm upload
        await taskAttachmentsApi.confirmUpload(taskId, {
          fileName: file.name,
          fileUrl: presigned.fileUrl,
          fileType: file.type,
          fileSize: file.size,
        })

        toast.success(`${file.name} uploaded`)
        queryClient.invalidateQueries({ queryKey: ["taskAttachments", taskId] })
        queryClient.invalidateQueries({ queryKey: ["taskTimeline", taskId] })
      } catch (err) {
        toast.error(
          `Failed to upload ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
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

  return (
    <div className="bg-white rounded-2xl shadow-sm mb-6">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="size-5 text-slate-400" />
            <h3 className="font-semibold text-gray-900">Attachments</h3>
            {attachments.length > 0 && (
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {attachments.length}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="size-3.5 mr-1.5" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      <div className="p-5">
        {/* Dropzone */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload
            className={`size-8 mx-auto mb-2 ${isDragging ? "text-blue-400" : "text-slate-300"}`}
          />
          <p className="text-sm text-slate-500">
            Drag & drop files here, or{" "}
            <span className="text-blue-600 font-medium">browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Images and documents up to 20MB
          </p>
        </div>

        {/* Uploading Files */}
        {uploadingFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadingFiles.map((uf) => (
              <div
                key={uf.id}
                className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg"
              >
                <Loader2 className="size-4 text-blue-500 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {uf.file.name}
                  </p>
                  <div className="w-full h-1.5 bg-blue-100 rounded-full mt-1.5">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.round(uf.progress * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-blue-600 font-medium shrink-0">
                  {Math.round(uf.progress * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="mt-4 flex items-center justify-center py-8">
            <Loader2 className="size-5 text-slate-400 animate-spin" />
          </div>
        )}

        {/* Attachment List */}
        {!isLoading && attachments.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative rounded-xl border border-slate-200 overflow-hidden bg-white hover:border-slate-300 transition-colors"
              >
                {isImageType(attachment.fileType) ? (
                  <a
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="aspect-square bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachment.fileUrl}
                        alt={attachment.fileName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </a>
                ) : (
                  <a
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="aspect-square bg-slate-50 flex flex-col items-center justify-center p-4">
                      <FileText className="size-10 text-slate-300 mb-2" />
                      <p className="text-xs text-slate-500 text-center truncate w-full px-2">
                        {attachment.fileName}
                      </p>
                    </div>
                  </a>
                )}

                {/* Overlay with info and actions */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                  <div className="w-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="text-xs text-white font-medium truncate">
                          {attachment.fileName}
                        </p>
                        <p className="text-xs text-white/70">
                          {formatFileSize(attachment.fileSize)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={attachment.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="size-3.5 text-white" />
                        </a>
                        <button
                          className="p-1.5 rounded-md bg-white/20 hover:bg-red-500/80 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(attachment)
                          }}
                        >
                          <Trash2 className="size-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && attachments.length === 0 && uploadingFiles.length === 0 && (
          <p className="text-center text-sm text-slate-400 mt-4">
            No attachments yet
          </p>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attachment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.fileName}&rdquo;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
