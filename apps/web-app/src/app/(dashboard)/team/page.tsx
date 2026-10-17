"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Search, Users } from "lucide-react"
import type { Colleague } from "@/lib/api/types/team"
import { PersonCard } from "@/components/people/person-card"
import { PersonDialog } from "@/components/people/person-dialog"
import { filterPeople, presenceOf, usePeople, type PresenceFilter } from "@/components/people/use-people"

const FILTERS: PresenceFilter[] = ["all", "AVAILABLE", "BUSY", "AWAY"]
const DOT: Record<string, string> = { AVAILABLE: "bg-emerald-500", BUSY: "bg-rose-500", AWAY: "bg-amber-500" }

/**
 * Team — who's who, for every member: managers first, then colleagues, with
 * whether each is around, Message and Profile. The same two lists as the
 * phone's Team tab.
 */
export default function TeamPage() {
  const { t } = useTranslation()
  const { managers, colleagues, all, loading } = usePeople()
  const [query, setQuery] = useState("")
  const [presence, setPresence] = useState<PresenceFilter>("all")
  const [profile, setProfile] = useState<Colleague | null>(null)
  const count = (f: PresenceFilter) =>
    f === "all" ? all.length : all.filter((p) => presenceOf(p.presence) === f).length
  const sections = [
    { key: "managers", label: t("team.managers", "Managers"), rows: filterPeople(managers, query, presence) },
    { key: "colleagues", label: t("team.colleagues", "Colleagues"), rows: filterPeople(colleagues, query, presence) },
  ].filter((s) => s.rows.length > 0)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-foreground">{t("team.title")}</h1>
      <p className="mb-5 text-sm text-muted-foreground">{t("team.subtitle")}</p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("team.search", "Search name, job, workspace")}
            aria-label={t("team.search", "Search name, job, workspace")}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("team.filterLabel", "Show")}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPresence(f)}
              aria-pressed={presence === f}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${presence === f ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {f !== "all" && <span className={`size-2 rounded-full ${DOT[f]}`} />}
              {f === "all"
                ? t("team.filter.all", { count: count(f), defaultValue: "All {{count}}" })
                : t(`team.filter.${f}`, { count: count(f) })}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-14 text-center">
          <Users className="mx-auto mb-2 size-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {all.length ? t("team.noMatch", "Nobody matches.") : t("team.empty")}
          </p>
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="mb-6">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {s.rows.map((p) => (
                <PersonCard key={p.id} person={p} onProfile={setProfile} />
              ))}
            </div>
          </section>
        ))
      )}
      <PersonDialog userId={profile?.id ?? null} onClose={() => setProfile(null)} />
    </div>
  )
}
