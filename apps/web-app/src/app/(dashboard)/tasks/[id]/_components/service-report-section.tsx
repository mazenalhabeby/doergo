"use client"

import { useState, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Clock,
  User,
  Wrench,
  Camera,
  PenTool,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  FileText,
  AlertCircle,
  Upload,
  Loader2,
  Trash2,
  X,
} from "lucide-react"
import { reportsApi, reportAttachmentsApi, type ServiceReport, type ReportAttachment, type PartUsed } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn, formatDuration } from "@/lib/utils"

interface ServiceReportSectionProps {
  taskId: string
  taskStatus: string
}

function PhotoGallery({
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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showFullscreen, setShowFullscreen] = useState(false)

  const filteredAttachments = attachments.filter((a) => a.type === type)

  if (filteredAttachments.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <div className="text-center">
          <Camera className="size-6 text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">No {type.toLowerCase()} photos</p>
        </div>
      </div>
    )
  }

  const current = filteredAttachments[currentIndex]!

  return (
    <div className="relative">
      <div
        className="relative h-48 bg-gray-100 rounded-lg overflow-hidden cursor-pointer group"
        onClick={() => setShowFullscreen(true)}
      >
        <img
          src={current.fileUrl}
          alt={current.fileName}
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
          <AttachmentDeleteButton
            reportId={reportId}
            attachmentId={current.id}
            taskId={taskId}
          />
        )}
      </div>

      {filteredAttachments.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCurrentIndex((i) => (i === 0 ? filteredAttachments.length - 1 : i - 1))
            }}
            className="absolute left-1 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full shadow hover:bg-white"
          >
            <ChevronLeft className="size-4 text-gray-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCurrentIndex((i) => (i === filteredAttachments.length - 1 ? 0 : i + 1))
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full shadow hover:bg-white"
          >
            <ChevronRight className="size-4 text-gray-600" />
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
            className="max-w-full max-h-full object-contain"
          />
          <button
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/30"
            onClick={() => setShowFullscreen(false)}
          >
            <span className="sr-only">Close</span>
            &times;
          </button>
        </div>
      )}
    </div>
  )
}

function PartsTable({ parts }: { parts: PartUsed[] }) {
  if (parts.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-gray-500">
        No parts used in this service.
      </div>
    )
  }

  const totalCost = parts.reduce((sum, part) => sum + (part.unitCost || 0) * part.quantity, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-700">Part</th>
            <th className="text-left py-2 px-3 font-medium text-gray-700">Part #</th>
            <th className="text-center py-2 px-3 font-medium text-gray-700">Qty</th>
            <th className="text-right py-2 px-3 font-medium text-gray-700">Unit Cost</th>
            <th className="text-right py-2 px-3 font-medium text-gray-700">Total</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id} className="border-b border-gray-100">
              <td className="py-2 px-3">
                <div>
                  <span className="text-gray-900">{part.name}</span>
                  {part.notes && (
                    <span className="block text-xs text-gray-500">{part.notes}</span>
                  )}
                </div>
              </td>
              <td className="py-2 px-3 text-gray-600">{part.partNumber || "-"}</td>
              <td className="py-2 px-3 text-center text-gray-600">{part.quantity}</td>
              <td className="py-2 px-3 text-right text-gray-600">
                {part.unitCost ? `$${part.unitCost.toFixed(2)}` : "-"}
              </td>
              <td className="py-2 px-3 text-right text-gray-900 font-medium">
                {part.unitCost ? `$${(part.unitCost * part.quantity).toFixed(2)}` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
        {totalCost > 0 && (
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={4} className="py-2 px-3 text-right font-medium text-gray-700">
                Total Parts:
              </td>
              <td className="py-2 px-3 text-right font-semibold text-gray-900">
                ${totalCost.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function SignatureDisplay({ label, signature, name }: { label: string; signature?: string | null; name?: string | null }) {
  if (!signature) {
    return (
      <div className="flex-1">
        <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
        <div className="h-24 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
          <p className="text-xs text-gray-400">No signature</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1">
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
        <img
          src={signature}
          alt={`${label} signature`}
          className="h-20 w-full object-contain"
        />
        {name && (
          <p className="text-xs text-center text-gray-600 mt-1">{name}</p>
        )}
      </div>
    </div>
  )
}

function AttachmentUpload({ reportId, taskId }: { reportId: string; taskId: string }) {
  const queryClient = useQueryClient()
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadType, setUploadType] = useState<"BEFORE" | "AFTER">("AFTER")
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]

  const uploadFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, and WebP images are accepted")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be under 10MB")
      return
    }

    setIsUploading(true)
    try {
      // Step 1: Get presigned URL
      const presigned = await reportAttachmentsApi.getPresignedUrl(
        reportId,
        file.name,
        file.type
      )
      if (!presigned) throw new Error("Failed to get upload URL")

      // Step 2: Upload to S3
      await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      // Step 3: Confirm upload
      await reportAttachmentsApi.confirmUpload(reportId, {
        type: uploadType,
        fileName: file.name,
        fileUrl: presigned.fileUrl,
        fileSize: file.size,
      })

      toast.success("Photo uploaded successfully")
      queryClient.invalidateQueries({ queryKey: ["taskReport", taskId] })
    } catch (e: any) {
      toast.error(e.message || "Upload failed")
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
    [uploadType]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
      // Reset input so the same file can be selected again
      e.target.value = ""
    },
    [uploadType]
  )

  return (
    <div className="mt-4 space-y-3">
      {/* Type toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Upload as:</span>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setUploadType("BEFORE")}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              uploadType === "BEFORE"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            Before
          </button>
          <button
            type="button"
            onClick={() => setUploadType("AFTER")}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              uploadType === "AFTER"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            After
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
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 bg-gray-50 hover:border-gray-300",
          isUploading && "pointer-events-none opacity-60"
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
              <p className="text-xs text-gray-600 font-medium">Uploading...</p>
            </>
          ) : (
            <>
              <Upload className="size-5 text-gray-400 mb-2" />
              <p className="text-xs text-gray-600 font-medium">
                Drop an image or click to upload
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                JPG, PNG, WebP up to 10MB
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentDeleteButton({
  reportId,
  attachmentId,
  taskId,
}: {
  reportId: string
  attachmentId: string
  taskId: string
}) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => reportAttachmentsApi.delete(reportId, attachmentId),
    onSuccess: () => {
      toast.success("Photo removed")
      queryClient.invalidateQueries({ queryKey: ["taskReport", taskId] })
    },
    onError: (e: Error) => toast.error(e.message || "Failed to remove photo"),
  })

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (confirm("Remove this photo?")) deleteMutation.mutate()
      }}
      disabled={deleteMutation.isPending}
      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
    >
      {deleteMutation.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <X className="size-3" />
      )}
    </button>
  )
}

export function ServiceReportSection({ taskId, taskStatus }: ServiceReportSectionProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  // Only fetch report for completed/closed tasks
  const shouldFetch = taskStatus === "COMPLETED" || taskStatus === "CLOSED"

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["taskReport", taskId],
    queryFn: () => reportsApi.getTaskReport(taskId),
    enabled: shouldFetch,
  })

  // Don't render anything if task is not completed
  if (!shouldFetch) {
    return null
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="size-5 text-gray-400 animate-pulse" />
          <h3 className="text-base font-semibold text-gray-900">Service Report</h3>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="size-5 text-green-500" />
          <h3 className="text-base font-semibold text-gray-900">Job Completed</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <AlertCircle className="size-4" />
          <p>No service report available for this task.</p>
        </div>
      </div>
    )
  }

  const attachments = report.attachments || []
  const partsUsed = report.partsUsed || []

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-500" />
          <h3 className="text-base font-semibold text-gray-900">Service Report</h3>
        </div>
        <span className="text-sm text-gray-500">
          Completed{" "}
          {new Date(report.completedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Summary</h4>
        <div className="bg-green-50 border-l-4 border-green-500 rounded-r-lg p-4">
          <p className="text-sm text-green-900">{report.summary}</p>
        </div>
      </div>

      {/* Work Performed */}
      {report.workPerformed && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Work Performed</h4>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 whitespace-pre-line">{report.workPerformed}</p>
          </div>
        </div>
      )}

      {/* Duration & Technician */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
          <Clock className="size-5 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500">Duration</p>
            <p className="text-sm font-semibold text-gray-900">{formatDuration(report.workDuration)}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
          <User className="size-5 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500">Technician</p>
            <p className="text-sm font-semibold text-gray-900">
              {report.completedBy ? `${report.completedBy.firstName} ${report.completedBy.lastName}` : "Unknown"}
            </p>
          </div>
        </div>
      </div>

      {/* Before & After Photos */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Camera className="size-4 text-gray-500" />
          <h4 className="text-sm font-medium text-gray-700">Before & After Photos</h4>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Before</p>
            <PhotoGallery
              attachments={attachments}
              type="BEFORE"
              reportId={report.id}
              taskId={taskId}
              canDelete={isAdmin}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">After</p>
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
        {isAdmin && (
          <AttachmentUpload reportId={report.id} taskId={taskId} />
        )}
      </div>

      {/* Parts Used */}
      {partsUsed.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="size-4 text-gray-500" />
            <h4 className="text-sm font-medium text-gray-700">Parts Used</h4>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <PartsTable parts={partsUsed} />
          </div>
        </div>
      )}

      {/* Signatures */}
      {(report.technicianSignature || report.customerSignature) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <PenTool className="size-4 text-gray-500" />
            <h4 className="text-sm font-medium text-gray-700">Signatures</h4>
          </div>
          <div className="flex gap-4">
            <SignatureDisplay
              label="Technician"
              signature={report.technicianSignature}
              name={report.completedBy ? `${report.completedBy.firstName} ${report.completedBy.lastName}` : undefined}
            />
            <SignatureDisplay
              label="Customer"
              signature={report.customerSignature}
              name={report.customerName}
            />
          </div>
        </div>
      )}
    </div>
  )
}
