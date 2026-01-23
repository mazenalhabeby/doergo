"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
} from "lucide-react"
import { reportsApi, ServiceReport, ReportAttachment, PartUsed } from "@/lib/api"

interface ServiceReportSectionProps {
  taskId: string
  taskStatus: string
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m`
  }
  return `${hours}h ${minutes}m`
}

function PhotoGallery({ attachments, type }: { attachments: ReportAttachment[]; type: "BEFORE" | "AFTER" }) {
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

  const current = filteredAttachments[currentIndex]

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

export function ServiceReportSection({ taskId, taskStatus }: ServiceReportSectionProps) {
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
      {attachments.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="size-4 text-gray-500" />
            <h4 className="text-sm font-medium text-gray-700">Before & After Photos</h4>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Before</p>
              <PhotoGallery attachments={attachments} type="BEFORE" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">After</p>
              <PhotoGallery attachments={attachments} type="AFTER" />
            </div>
          </div>
        </div>
      )}

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
