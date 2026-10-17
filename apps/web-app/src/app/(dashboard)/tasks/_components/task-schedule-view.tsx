"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"

import type { Task, Epic, Phase } from "@/lib/api"

// Lazy (audit T-C1): the schedule is an alternate view, loaded when opened.
const TimelineView = dynamic(() => import("./timeline-view").then((m) => m.TimelineView), { ssr: false })
const CalendarView = dynamic(() => import("./calendar-view").then((m) => m.CalendarView), { ssr: false })
const EpicRoadmap = dynamic(() => import("./epic-roadmap").then((m) => m.EpicRoadmap), { ssr: false })

/** Schedule View — Roadmap + Timeline + Calendar. */
export function TaskScheduleView({
  tasks,
  filteredTasks,
  showRoadmap,
  epics: effectiveEpics,
  phases: effectivePhases,
  epicFilter,
  onEpicFilterChange,
}: {
  /** Unfiltered tasks, so the roadmap stays visible when the epic filter is active. */
  tasks: Task[]
  filteredTasks: Task[]
  showRoadmap: boolean
  epics: Epic[]
  phases: Phase[]
  epicFilter: string
  onEpicFilterChange: (epicId: string) => void
}) {
  const { t } = useTranslation()

  return (
          <div data-tour="tasks-schedule" className="space-y-6">
            {/* Roadmap section — only when space has epics module */}
            {showRoadmap && (() => {
              // Use unfiltered tasks so roadmap stays visible when epic filter is active
              const epicIdsInView = new Set(tasks.map((t: Task) => t.epicId).filter(Boolean))
              const visibleEpics = effectiveEpics.filter(e => epicIdsInView.has(e.id))
              if (visibleEpics.length === 0) return null
              return (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.schedule.roadmap")}</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                  <EpicRoadmap
                    epics={visibleEpics}
                    tasks={tasks}
                    activeEpicId={epicFilter !== "all" && epicFilter !== "none" ? epicFilter : null}
                    onEpicClick={(epicId) => {
                      onEpicFilterChange(epicId ?? "all")
                    }}
                  />
                </div>
              )
            })()}

            {/* Timeline section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.schedule.timeline")}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <TimelineView tasks={filteredTasks} phases={effectivePhases} />
            </div>

            {/* Calendar section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.schedule.calendar")}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <CalendarView tasks={filteredTasks} />
            </div>
          </div>
  )
}
