"use client"

import {
  FileText,
  Image as ImageIcon,
  Film,
  Download,
} from "lucide-react"

interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  createdAt: string
}

interface TaskData {
  description: string | null
  priority: string | null
  dueDate: string | null
  locationAddress: string | null
  createdBy?: {
    firstName: string
    lastName: string
  } | null
  attachments?: Attachment[]
}

interface RequestDetailsSectionProps {
  task: TaskData
}

export function RequestDetailsSection({
  task,
}: RequestDetailsSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">
          Request Details
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Description */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Description
          </h4>
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              {task.description || "No description provided."}
            </p>
          </div>
        </div>

        {/* Task Information */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Task Information
          </h4>
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Location</p>
                {task.locationAddress ? (
                  <p className="text-sm text-gray-900">{task.locationAddress}</p>
                ) : (
                  <p className="text-sm text-gray-400">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Due Date</p>
                <p className="text-sm text-gray-900">
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Created By</p>
                <p className="text-sm text-gray-900">
                  {task.createdBy
                    ? `${task.createdBy.firstName} ${task.createdBy.lastName}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Priority</p>
                <p className="text-sm text-blue-600 font-medium">
                  {task.priority || "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Attachments */}
        {task.attachments && task.attachments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Attachments
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {task.attachments.map((attachment) => {
                const Icon = attachment.fileType === "IMAGE" ? ImageIcon
                  : attachment.fileType === "DOCUMENT" ? FileText
                  : Film
                const fileSize = attachment.fileSize < 1024 * 1024
                  ? `${(attachment.fileSize / 1024).toFixed(1)} KB`
                  : `${(attachment.fileSize / (1024 * 1024)).toFixed(1)} MB`

                return (
                  <div
                    key={attachment.id}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <div className="w-12 h-12 border border-gray-200 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="size-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate mb-0.5">
                      {attachment.fileName}
                    </p>
                    <p className="text-xs text-gray-400 mb-2">{fileSize}</p>
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Download className="size-3.5" /> Download
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
