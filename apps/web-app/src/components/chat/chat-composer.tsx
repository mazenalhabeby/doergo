"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { toast } from "sonner"
import type { ChatAttachment } from "@hbcfield/shared/client"
import { CHAT_MAX_ATTACHMENTS, chatFileAllowed, uploadChatFile } from "@/lib/chat-upload"

type Pending = { name: string; done?: ChatAttachment; failed?: boolean }

/**
 * The box to write in: words, up to five files (uploaded as soon as they are
 * picked, so Send is instant), Enter to send, Shift+Enter for a new line. In
 * edit mode it holds your message and saves it instead.
 */
export function ChatComposer({
  conversationId,
  onSend,
  onTyping,
  editing,
  onSaveEdit,
  onCancelEdit,
}: {
  conversationId: string
  onSend: (body: string, attachments: ChatAttachment[]) => void
  onTyping: () => void
  editing: { id: string; body: string } | null
  onSaveEdit: (id: string, body: string) => void
  onCancelEdit: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [files, setFiles] = useState<Pending[]>([])
  // Bumped on every send: the arrow flies out and back (a remount restarts the animation).
  const [flew, setFlew] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setText(editing.body)
      ta.current?.focus()
    }
  }, [editing])
  const grow = () => {
    const el = ta.current
    if (el) {
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }
  useEffect(grow, [text])

  const uploading = files.some((f) => !f.done && !f.failed)
  const ready = files.filter((f) => f.done).map((f) => f.done!)
  const canSend = !uploading && (text.trim().length > 0 || ready.length > 0)

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).slice(0, CHAT_MAX_ATTACHMENTS - files.length)
    for (const file of chosen) {
      if (!chatFileAllowed(file)) {
        toast.error(
          t("chat.fileNotAllowed", { defaultValue: "{{name}} cannot be sent (type or size)", name: file.name }),
        )
        continue
      }
      setFiles((f) => [...f, { name: file.name }])
      uploadChatFile(conversationId, file)
        .then((done) => setFiles((f) => f.map((x) => (x.name === file.name && !x.done ? { ...x, done } : x))))
        .catch(() => setFiles((f) => f.map((x) => (x.name === file.name && !x.done ? { ...x, failed: true } : x))))
    }
  }

  const submit = () => {
    if (editing) {
      if (text.trim()) onSaveEdit(editing.id, text.trim())
    } else {
      if (!canSend) return
      onSend(text.trim(), ready)
      setFiles([])
      setFlew((n) => n + 1)
    }
    setText("")
  }

  return (
    <div className="border-t border-border bg-background p-2.5">
      {editing && (
        <div className="mb-1.5 flex items-center justify-between rounded-lg bg-muted px-3 py-1 text-xs text-muted-foreground">
          {t("chat.editing", "Editing your message")}
          <button
            type="button"
            className="icon-motion"
            onClick={() => {
              setText("")
              onCancelEdit()
            }}
            aria-label={t("common.cancel", "Cancel")}
          >
            <GradientIcon name="xLine" size={14} flat />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={i}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${f.failed
                ? "border-red-300 text-red-600"
                : "border-border text-foreground"}`}
            >
              {!f.done && !f.failed && <Loader2 className="size-3 animate-spin" />}
              <span className="max-w-40 truncate">{f.name}</span>
              <button
                type="button"
                className="icon-motion"
                onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                aria-label={t("common.remove", "Remove")}
              >
                <GradientIcon name="xLine" size={12} flat />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {!editing && (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={(e) => {
                pick(e.target.files)
                e.target.value = ""
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={files.length >= CHAT_MAX_ATTACHMENTS}
              aria-label={t("chat.attach", "Add a photo or file")}
              title={t("chat.attach", "Add a photo or file")}
              className={"icon-motion flex size-9 shrink-0 items-center justify-center " +
                "rounded-full transition-colors hover:bg-blue-500/10 disabled:opacity-40"}
            >
              <GradientIcon name="attach" size={22} />
            </button>
          </>
        )}
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (!editing) onTyping()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
            if (e.key === "Escape" && editing) {
              setText("")
              onCancelEdit()
            }
          }}
          placeholder={t("chat.messagePlaceholder", "Write a message…")}
          aria-label={t("chat.messagePlaceholder", "Write a message…")}
          rows={1}
          maxLength={5000}
          className={"max-h-[120px] flex-1 resize-none rounded-2xl border border-border " +
            "bg-muted px-3.5 py-2 text-[13.5px] outline-none " +
            "transition-[border-color,background-color,box-shadow] duration-200 " +
            "focus:border-blue-400 focus:bg-background " +
            "focus:shadow-[0_0_0_4px_rgb(59_130_246/0.15)]"}
        />
        <button
          type="button"
          disabled={editing ? !text.trim() : !canSend}
          onClick={submit}
          aria-label={editing ? t("common.save", "Save") : t("chat.send", "Send")}
          className={"icon-motion flex size-9 shrink-0 items-center justify-center " +
            "rounded-full bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 " +
            "text-white shadow-sm shadow-blue-500/30 " +
            "transition-[transform,opacity,box-shadow] duration-200 hover:shadow-md " +
            "hover:shadow-blue-500/40 active:scale-90 disabled:from-muted " +
            "disabled:via-muted disabled:to-muted disabled:text-muted-foreground " +
            "disabled:shadow-none"}
        >
          <span key={flew} className={flew ? "motion-fly" : undefined}>
            <GradientIcon name={editing ? "check" : "send"} size={18} flat />
          </span>
        </button>
      </div>
    </div>
  )
}
