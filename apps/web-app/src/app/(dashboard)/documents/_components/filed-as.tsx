"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pencil } from "lucide-react"
import type { Row } from "../_lib/issue-rows"

/**
 * "Will be filed as …" on every row, with a pencil to name it yourself.
 *
 * Shown always — before, it appeared only when a PDF's heading was read, so a
 * photo or a scan said nothing at all about what the member would see. Editing
 * is local to the row: nothing is sent until the upload, which already carries
 * the title. Clearing the field goes back to the automatic name.
 */
export function FiledAs({
  row,
  filedAs,
  baseName,
  locked,
  onRename,
}: {
  row: Row
  filedAs: string
  baseName: string
  locked: boolean
  onRename: (customTitle: string) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    onRename(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mt-1 pl-6">
        <input
          ref={inputRef}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit() }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false) }
          }}
          placeholder={row.docTitle || t("documents.issue.namePlaceholder")}
          aria-label={t("documents.issue.rename")}
          className="h-7 w-full max-w-sm rounded-md border border-blue-500 bg-white px-2 text-xs text-slate-900 outline-none dark:bg-slate-900 dark:text-slate-100"
        />
        <p className="mt-0.5 text-[10.5px] text-slate-400">{t("documents.issue.renameHint")}</p>
      </div>
    )
  }

  return (
    <div className="mt-0.5 flex items-center gap-1 pl-6 text-[11px] text-slate-600 dark:text-slate-300">
      <span className="min-w-0 truncate">{t("documents.issue.namedAs", { title: filedAs })}</span>
      {!locked && (
        <button
          type="button"
          onClick={() => { setDraft(baseName); setEditing(true) }}
          aria-label={t("documents.issue.rename")}
          title={t("documents.issue.rename")}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
