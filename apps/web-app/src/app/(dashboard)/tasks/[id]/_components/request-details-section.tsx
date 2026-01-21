"use client"

import { useState } from "react"
import {
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Film,
  Download,
} from "lucide-react"

import { cn } from "@/lib/utils"

interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  createdAt: string
}

interface TaskData {
  id: string
  title: string
  description: string | null
  status: string
  priority: string | null
  dueDate: string | null
  locationAddress: string | null
  createdAt: string
  updatedAt: string
  createdBy?: {
    firstName: string
    lastName: string
  } | null
  assignedTo?: {
    firstName: string
    lastName: string
    email?: string
  } | null
  attachments?: Attachment[]
}

interface RequestDetailsSectionProps {
  task: TaskData
  isCompleted: boolean
}

export function RequestDetailsSection({
  task,
  isCompleted,
}: RequestDetailsSectionProps) {
  const [showDetails, setShowDetails] = useState(true)
  const hasAssignee = !!task.assignedTo

  return (
    <div className="bg-white rounded-2xl shadow-sm">
      {isCompleted && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between p-6 border-b border-gray-100"
        >
          <h3 className="text-base font-semibold text-gray-900">
            Request details
          </h3>
          <ChevronDown
            className={cn(
              "size-5 text-gray-400 transition-transform",
              showDetails && "rotate-180"
            )}
          />
        </button>
      )}

      {(showDetails || !isCompleted) && (
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Description
            </h3>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                {task.description || "No description provided."}
              </p>
            </div>
          </div>

          {/* Task Information */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Task Information
            </h3>
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

          {/* Maintenance History */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Maintenance History
            </h3>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-sm font-medium text-gray-900 mb-4">
                Task ID: #{task.id.slice(0, 3).toUpperCase()}
              </p>
              <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Issue:</span>
                  <span className="text-gray-900">{task.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Duration:</span>
                  <span className="text-gray-900">
                    {Math.max(
                      1,
                      Math.ceil(
                        (Date.now() - new Date(task.createdAt).getTime()) /
                          86400000
                      )
                    )}{" "}
                    days
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Reported Date:</span>
                  <span className="text-gray-900">
                    {new Date(task.createdAt).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Technician:</span>
                  <span className="text-gray-900">
                    {task.assignedTo
                      ? `${task.assignedTo.firstName} ${task.assignedTo.lastName[0]}.`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Start Date:</span>
                  <span className="text-gray-900">
                    {hasAssignee
                      ? new Date(task.updatedAt).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Technician Contact:</span>
                  <span className="text-gray-900">
                    {task.assignedTo?.email || "—"}
                  </span>
                </div>
                {isCompleted && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Completed Date:</span>
                    <span className="text-gray-900">
                      {new Date().toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attachments */}
          {task.attachments && task.attachments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Attachments
              </h3>
              <div className="grid grid-cols-4 gap-4">
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
      )}
    </div>
  )
}
