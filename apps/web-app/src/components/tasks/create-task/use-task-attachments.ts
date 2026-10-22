"use client"

import { useState, useCallback } from "react"

/**
 * The files a new task is created with: held here until the task exists, then
 * uploaded by the create mutation's onSuccess (use-create-task-form.ts).
 */
export function useTaskAttachments() {
  // ── Attachments ──
  const [isDragOver, setIsDragOver] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // ── File handling ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("image/") || file.type === "application/pdf",
    )
    setAttachments((prev) => [...prev, ...files])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(
        (file) => file.type.startsWith("image/") || file.type === "application/pdf",
      )
      setAttachments((prev) => [...prev, ...files])
    }
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  return {
    isDragOver,
    setIsDragOver,
    attachments,
    setAttachments,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileSelect,
    removeAttachment,
  }
}
