"use client"

import {
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
  CheckCircle2,
} from "lucide-react"

interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
}

interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    firstName: string
    lastName: string
  }
}

interface JobReportSectionProps {
  attachments?: Attachment[]
  comments?: Comment[]
  completedAt?: string
}

export function JobReportSection({ attachments = [], comments = [], completedAt }: JobReportSectionProps) {
  // Get the last comment as closing note
  const closingNote = comments.length > 0 ? comments[0] : null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 className="size-5 text-green-500" />
        <h3 className="text-base font-semibold text-gray-900">Job Completed</h3>
      </div>

      {/* Closing Notes */}
      {closingNote && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-900 mb-3">Closing Notes</p>
          <div className="border-l-4 border-green-500 bg-green-50 rounded-r-lg p-4">
            <p className="text-sm text-green-900">{closingNote.content}</p>
            <p className="text-xs text-green-600 mt-2">
              {closingNote.user.firstName} {closingNote.user.lastName} •{" "}
              {new Date(closingNote.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      )}

      {/* Job Attachments */}
      {attachments.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-900 mb-3">Attachments</p>
          <div className="flex flex-wrap gap-4">
            {attachments.map((attachment) => {
              const Icon = attachment.fileType === "IMAGE" ? ImageIcon : FileText
              const iconColor = attachment.fileType === "IMAGE" ? "text-blue-500" : "text-red-500"
              const fileSize = attachment.fileSize < 1024 * 1024
                ? `${(attachment.fileSize / 1024).toFixed(1)} KB`
                : `${(attachment.fileSize / (1024 * 1024)).toFixed(1)} MB`

              return (
                <div key={attachment.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3">
                  <Icon className={`size-5 ${iconColor}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{attachment.fileName}</p>
                    <p className="text-xs text-gray-400">{fileSize}</p>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-gray-100 rounded"
                    >
                      <Download className="size-4 text-gray-400" />
                    </a>
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-gray-100 rounded"
                    >
                      <Eye className="size-4 text-gray-400" />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!closingNote && attachments.length === 0 && (
        <p className="text-sm text-gray-500">No job report details available.</p>
      )}
    </div>
  )
}
