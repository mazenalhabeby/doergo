"use client"

import type { Dispatch, RefObject, SetStateAction } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Files picked to go with a note or a message, before it is sent — the work
 * log and the issue thread both compose this way: a hidden picker, a row of
 * removable chips, and a lightbox for the photos already posted.
 */

/** The hidden file input; picks are appended and capped at `max`. */
export function AttachmentPicker({
  inputRef,
  setFiles,
  max,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  setFiles: Dispatch<SetStateAction<File[]>>
  max: number
}) {
  return (
    <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
      onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, max)); e.currentTarget.value = "" }} />
  )
}

/** The picked files as chips, each with its own remove button. */
export function PendingFileChips({
  files,
  setFiles,
  className,
  chipClassName,
}: {
  files: File[]
  setFiles: Dispatch<SetStateAction<File[]>>
  className?: string
  chipClassName?: string
}) {
  if (files.length === 0) return null
  return (
    <div className={cn(className, "flex flex-wrap gap-1.5")}>
      {files.map((f, i) => (
        <span key={i} className={cn("inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]", chipClassName)}>
          <span className="max-w-[120px] truncate">{f.name}</span>
          <button
            onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
            className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
  )
}

/** A photo full screen; a click outside it (or the X) closes. */
export function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" decoding="async" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
