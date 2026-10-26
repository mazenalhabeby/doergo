"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Colleague } from "@/lib/api/types/team"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Icon } from "@/components/ui/icon"
import { GroupLabel, PageHeader, Panel } from "@/components/page/page-kit"
import { FilterPill, FilterPills, SearchPill } from "@/components/page/page-controls"
import { PersonCard } from "@/components/people/person-card"
import { PersonDialog } from "@/components/people/person-dialog"
import { filterPeople, presenceOf, usePeople, type PresenceFilter } from "@/components/people/use-people"

const FILTERS: PresenceFilter[] = ["all", "AVAILABLE", "BUSY", "AWAY"]
const DOT: Record<string, string> = { AVAILABLE: "bg-shell-live", BUSY: "bg-shell-crit", AWAY: "bg-shell-warn" }

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
    <div className={PAGE_SHELL}>
      <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchPill
          className="sm:w-[280px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("team.search", "Search name, job, workspace")}
        />
        <FilterPills label={t("team.filterLabel", "Show")}>
          {FILTERS.map((f) => (
            <FilterPill
              key={f}
              active={presence === f}
              onClick={() => setPresence(f)}
              dot={f !== "all" ? DOT[f] : undefined}
            >
              {f === "all"
                ? t("team.filter.all", { count: count(f), defaultValue: "All {{count}}" })
                : t(`team.filter.${f}`, { count: count(f) })}
            </FilterPill>
          ))}
        </FilterPills>
      </div>

      {loading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[22px] bg-card" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <Panel className="py-14 text-center">
          <Icon name="people" size={26} className="mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {all.length ? t("team.noMatch", "Nobody matches.") : t("team.empty")}
          </p>
        </Panel>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="mb-6">
            <GroupLabel className="px-1">{s.label}</GroupLabel>
            <div className="mt-1 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
