"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Upload,
  Trash2,
  FileText,
  Download,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { formatFileSize } from "@hbcfield/shared/client"
import { taskAttachmentsApi, uploadToS3, type Attachment } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useAttachmentsSection, ALLOWED_TYPES } from "./use-attachments-section"
import { isImageType } from "./attachments-section-helpers"

export function AttachmentsSection({
  taskId,
  initialAttachments,
}: {
  taskId: string
  /**
   * The attachments the task detail response already carried. Without this the
   * section refetched the exact rows the page had just paid for — findOne
   * includes them — so opening a task fetched its attachments twice.
   */
  initialAttachments?: Attachment[]
}) {
  const {
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
  } = useAttachmentsSection({ taskId, initialAttachments })

  /*
    Content only — no card, no header.
    
    CollapsibleSection already draws the card, the Paperclip, the "Attachments"
    title and the count, so this drew the whole lot a second time inside it:
    one section headed Attachments containing a box headed Attachments, same
    icon, same number. The Upload button moves down beside the dropzone it
    triggers, which is where it was always pointing.
  */
  return (
    <div>
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

      <div>
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="size-3.5 mr-1.5" />
            {t("tasks.attachments.upload")}
          </Button>
        </div>
        {/* Dropzone */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-border hover:border-border bg-muted"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload
            className={`size-8 mx-auto mb-2 ${isDragging ? "text-blue-400" : "text-muted-foreground"}`}
          />
          <p className="text-sm text-muted-foreground">
            {t("tasks.attachments.dragDropPrefix")}{" "}
            <span className="text-blue-600 font-medium">{t("tasks.attachments.browse")}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("tasks.attachments.sizeHint")}
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
                  <p className="text-sm font-medium text-foreground truncate">
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
            <Loader2 className="size-5 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* Attachment List */}
        {!isLoading && attachments.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative rounded-xl border border-border overflow-hidden bg-card hover:border-border transition-colors"
              >
                {isImageType(attachment.fileType) ? (
                  <a
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="aspect-square bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachment.fileUrl}
                        alt={attachment.fileName}
                        loading="lazy"
                        decoding="async"
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
                    <div className="aspect-square bg-muted flex flex-col items-center justify-center p-4">
                      <FileText className="size-10 text-muted-foreground mb-2" />
                      <p className="text-xs text-muted-foreground text-center truncate w-full px-2">
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
                          {formatFileSize(attachment.fileSize, i18n.language)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={attachment.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md bg-card/20 hover:bg-card/30 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="size-3.5 text-white" />
                        </a>
                        <button
                          className="p-1.5 rounded-md bg-card/20 hover:bg-red-500/80 transition-colors"
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
          <p className="text-center text-sm text-muted-foreground mt-4">
            {t("tasks.attachments.empty")}
          </p>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("tasks.attachments.deleteTitle")}
        description={t("tasks.attachments.deleteDescription", { name: deleteTarget?.fileName })}
        confirmLabel={
          deleteMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            t("common.delete")
          )
        }
        onConfirm={() =>
          deleteTarget && deleteMutation.mutate(deleteTarget.id)
        }
        destructive
      />
    </div>
  )
}
