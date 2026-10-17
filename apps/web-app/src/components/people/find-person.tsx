"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"
import { personName } from "@hbcfield/shared/client"
import { useRouteAccess } from "@/hooks/use-route-access"
import { ChatAvatar } from "@/components/chat/chat-avatar"
import { filterPeople, usePeople } from "./use-people"
import { PersonDialog } from "./person-dialog"

/**
 * "Find a person" on the dashboard: type a name, job or workspace, pick
 * somebody, and see their page (or their short card). The lists are Team's —
 * read only when the box is first used.
 */
export function FindPerson() {
  const { t } = useTranslation()
  const router = useRouter()
  const { may } = useRouteAccess()
  const [used, setUsed] = useState(false)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Team's lists, read only once the box is used — the dashboard's first paint never waits on them.
  const people = usePeople(used).all
  const hits = useMemo(() => (query.trim() ? filterPeople(people, query, "all").slice(0, 8) : []), [people, query])

  const choose = (id: string) => {
    setOpen(false)
    setQuery("")
    if (may(`/members/${id}`)) router.push(`/members/${id}`)
    else setCard(id)
  }

  return (
    <div
      ref={box}
      className="relative w-56"
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onFocus={() => {
          setUsed(true)
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) choose(hits[0].id)
          if (e.key === "Escape") setOpen(false)
        }}
        placeholder={t("team.find", "Find a person…")}
        aria-label={t("team.find", "Find a person…")}
        className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
      />
      {open && hits.length > 0 && (
        <ul
          role="listbox"
          className="absolute right-0 top-9 z-30 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(p.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted"
              >
                <ChatAvatar u={p} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{personName(p)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[p.position, p.spaceName].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PersonDialog userId={card} onClose={() => setCard(null)} />
    </div>
  )
}
