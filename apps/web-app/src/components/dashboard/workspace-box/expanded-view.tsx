"use client"

import { Ghost, Settings, UserPlus, ChevronLeft, ClipboardList } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { PersonNodeProps } from "../person-node"
import { APPLE_EASE, type SubPanel } from "./constants"
import { SideStatusBox } from "./side-status-box"
import { OffDutyRow } from "./off-duty-row"
import { ExpandedWorkerCell } from "./expanded-worker-cell"

export interface ExpandedViewProps {
  people: PersonNodeProps[]
  onRoadPeople: PersonNodeProps[]
  remotePeople: PersonNodeProps[]
  offShiftPeople: PersonNodeProps[]
  offDutyPeople: PersonNodeProps[]
  subPanel: SubPanel
  setSubPanel: (panel: SubPanel) => void
  handleSubPanelClick: (panel: SubPanel) => void
  isClosing: boolean
  canSeeAbsenceReason: boolean
  locationId?: string
  onEdit?: (locationId: string) => void
  onAssign?: (locationId: string) => void
  onViewTasks?: (locationId: string) => void
  onPersonClick?: (userId: string) => void
}

/** The EXPANDED card body — worker cells, the side status boxes, and the bottom actions. */
export function ExpandedView({
  people,
  onRoadPeople,
  remotePeople,
  offShiftPeople,
  offDutyPeople,
  subPanel,
  setSubPanel,
  handleSubPanelClick,
  isClosing,
  canSeeAbsenceReason,
  locationId,
  onEdit,
  onAssign,
  onViewTasks,
  onPersonClick,
}: ExpandedViewProps) {
  const { t } = useTranslation()
  return (
    <>
      <div
        data-tour="dash-space-members"
        className="flex-1 overflow-auto flex gap-[5px] p-[5px]"
        style={{
          opacity: isClosing ? 0 : 1,
          transform: isClosing ? "scale(0.97)" : "scale(1)",
          transition: `opacity 0.5s ${APPLE_EASE}, transform 0.5s ${APPLE_EASE}`,
        }}
      >
        {(() => {
          // Build the groups: on-site, in-field, off-site, off-duty
          const groups = [
            { key: null as SubPanel, label: t("workspace.groupPresent"), people, variant: "cells" as const },
            { key: "inField" as SubPanel, label: t("workspace.groupInField"), people: onRoadPeople, variant: "cells" as const },
            { key: "offSite" as SubPanel, label: t("workspace.groupOffSite"), people: remotePeople, variant: "cells" as const },
            {
              key: "offShift" as SubPanel,
              label: t("workspace.groupOffShift", "Off-shift"),
              people: offShiftPeople,
              variant: "cells" as const
            },
            { key: "offDuty" as SubPanel, label: t("workspace.groupOffDuty"), people: offDutyPeople, variant: "offduty" as const },
          ].filter(g => g.people.length > 0 || g.key === null)

          const activeGroup = subPanel ? groups.find(g => g.key === subPanel) : groups.find(g => g.key === null)
          const sideGroups = groups.filter(g => g.key !== (subPanel || null))

          return (
            <>
              {/* Left — expanded group */}
              <div key={subPanel || "default"} className="flex-1 flex flex-col gap-2 min-w-0">
                {subPanel && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSubPanel(null) }}
                    className={"flex items-center gap-1.5 text-[11px] font-medium text-foreground/50 " +
                      "hover:text-foreground/80 transition-colors self-start px-1"}
                    style={{ animation: `fadeIn 0.4s ${APPLE_EASE} both` }}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {activeGroup?.label}
                  </button>
                )}

                {activeGroup && activeGroup.variant === "offduty" ? (
                  <div className="flex-1 flex flex-col gap-1 overflow-auto">
                    {activeGroup.people.map((person, i) => (
                      <OffDutyRow key={`${person.name}-${i}`} person={person} delay={i * 0.05} canSeeAbsenceReason={canSeeAbsenceReason} />
                    ))}
                    {activeGroup.people.length === 0 && (
                      <div
                        className="flex-1 flex items-center justify-center text-xs text-foreground/30">{t(
                          "workspace.allAccountedFor")}</div>
                    )}
                  </div>
                ) : activeGroup && activeGroup.people.length > 0 ? (
                  <div className="flex-1 grid grid-cols-[repeat(auto-fill,minmax(140px,160px))] gap-[5px] content-start">
                    {activeGroup.people.map((person, i) => (
                      <ExpandedWorkerCell
                        key={`${person.name}-${i}`}
                        person={person}
                        delay={i * 0.04}
                        onPersonClick={onPersonClick}
                        dataTour={i === 0 ? "dash-space-member" : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3">
                    <Ghost className="h-10 w-10 text-foreground/10" />
                    {(onRoadPeople.length > 0 || remotePeople.length > 0) ? (
                      <>
                        <span className="text-sm text-foreground/30">{t("workspace.noOnePresent")}</span>
                        <span className="text-xs text-foreground/20">
                          {[
                            onRoadPeople.length > 0 && t("workspace.inFieldCount", { count: onRoadPeople.length }),
                            remotePeople.length > 0 && t("workspace.offSiteCount", { count: remotePeople.length }),
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-foreground/30">{t("workspace.noActiveMembers")}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Right — other groups as side boxes */}
              {sideGroups.filter(g => g.people.length > 0).length > 0 && (
                <div
                  key={`side-${subPanel || "default"}`}
                  className="w-[210px] shrink-0 flex flex-col gap-[5px] overflow-auto"
                  style={{ animation: `expandIn 0.6s ${APPLE_EASE} 0.1s both` }}
                >
                  {sideGroups.map(g => g.people.length > 0 && (
                    <SideStatusBox
                      key={g.label}
                      label={g.label}
                      people={g.people}
                      variant={g.variant === "offduty" ? "dots" : "cells"}
                      onClick={() => handleSubPanelClick(g.key)}
                      dataTour={
                        g.key === "inField" ? "dash-space-field" :
                        g.key === "offSite" ? "dash-space-offsite" :
                        g.key === "offDuty" ? "dash-space-offduty" :
                        g.key === "offShift" ? "dash-space-offshift" : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Bottom action buttons */}
      <div
        data-tour="dash-space-actions"
        className="shrink-0 flex items-center justify-center gap-2 px-4 pb-3 pt-1"
        style={{ animation: `fadeIn 0.5s ${APPLE_EASE} 0.3s both` }}
      >
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(locationId || "") }}
            className={"group flex items-center gap-2 px-4 py-2 rounded-full text-[11px] " +
              "font-medium text-foreground/70 bg-foreground/[0.08] " +
              "hover:bg-foreground/[0.14] backdrop-blur-sm transition-all duration-200 " +
              "hover:scale-[1.02]"}
          >
            <Settings className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
            {t("workspace.manageSpace")}
          </button>
        )}
        {onAssign && (
          <button
            onClick={(e) => { e.stopPropagation(); onAssign(locationId || "") }}
            className={"group flex items-center gap-2 px-4 py-2 rounded-full text-[11px] " +
              "font-medium text-primary-foreground bg-primary/80 hover:bg-primary " +
              "transition-all duration-200 hover:scale-[1.02] shadow-sm " +
              "shadow-primary/20"}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t("workspace.addMember")}
          </button>
        )}
        {onViewTasks && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewTasks(locationId || "") }}
            className={"group flex items-center gap-2 px-4 py-2 rounded-full text-[11px] " +
              "font-medium text-foreground/70 bg-foreground/[0.08] " +
              "hover:bg-foreground/[0.14] backdrop-blur-sm transition-all duration-200 " +
              "hover:scale-[1.02]"}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {t("workspace.viewTasks")}
          </button>
        )}
      </div>
    </>
  )
}
