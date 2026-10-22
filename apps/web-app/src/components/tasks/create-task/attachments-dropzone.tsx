"use client"

import { useTranslation } from "react-i18next"
import { FileText, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { type CreateTaskForm } from "./use-create-task-form"

/** Files to attach — uploaded once the task exists. */
export function AttachmentsDropzone({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    isDragOver,
    attachments,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileSelect,
    removeAttachment,
    isSubmitting,
  } = form

  return (
    <div className="space-y-2 pt-1">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-all duration-150",
          isDragOver
            ? "border-blue-400 bg-blue-50 dark:bg-blue-500/10"
            : "border-border/60 bg-card hover:border-border",
        )}
      >
        <input
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isSubmitting}
        />
        <div className="flex items-center justify-center gap-2 py-4 px-4">
          <Upload className="size-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {t("tasks.create.dragAndDrop")} &middot; {t("tasks.create.imagesAndPdfOnly")}
          </p>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div key={index} className="group relative">
              {file.type.startsWith("image/") ? (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className={"absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white " +
                      "opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"}
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ) : (
                <div className="relative flex items-center gap-1.5 rounded-lg bg-muted border border-border pl-2 pr-1.5 py-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground max-w-[80px] truncate">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="p-0.5 rounded-full hover:bg-muted transition-colors"
                  >
                    <X className="size-3 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
