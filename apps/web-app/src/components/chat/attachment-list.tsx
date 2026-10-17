"use client"

import { GradientIcon } from "@/components/ui/gradient-icon"
import type { ChatAttachment } from "@hbcfield/shared/client"

const isImage = (a: ChatAttachment) => a.mimeType?.startsWith("image/")
const kb = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

/**
 * The files in a message. Photos draw at their real shape (width/height from
 * the upload, so the thread does not jump as they load); a click opens the
 * file. Links are the server's short-lived signed ones — never stored.
 */
export function AttachmentList({ items, mine }: { items: ChatAttachment[]; mine: boolean }) {
  if (!items.length) return null
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {items.map((a) =>
        isImage(a) && a.url ? (
          <a
            key={a.fileKey}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.fileName}
              loading="lazy"
              decoding="async"
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              className="max-h-72 w-auto max-w-full object-cover"
              style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
            />
          </a>
        ) : (
          <a
            key={a.fileKey}
            href={a.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs ${mine ? "bg-white/15" : "bg-background/70"}`}
          >
            <GradientIcon name="file" size={18} flat={mine} />
            <span className="min-w-0 flex-1 truncate font-medium">{a.fileName}</span>
            <span className="shrink-0 opacity-70">{kb(a.fileSize)}</span>
          </a>
        ),
      )}
    </div>
  )
}
