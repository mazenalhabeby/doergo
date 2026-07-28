"use client"

import React, { useState, useCallback, useEffect } from "react"
import { Ghost, Circle, Briefcase, Clock, AlertTriangle, WifiOff, Lock, X, Settings, UserPlus, Maximize2, ChevronLeft, CalendarOff, ShieldAlert, ClipboardList, MessageCircle, Phone, Video, User, ArrowUpRight, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { employeesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { hasAccessModule } from "@hbcfield/shared/client"
import { PersonNode, type PersonNodeProps } from "./person-node"
import { useChat } from "@/components/chat/chat-drawer"
import { WorkerAvatar } from "./worker-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const APPLE_EASE_CLASS = "ease-[cubic-bezier(0.32,0.72,0,1)]"

export interface WorkspaceBoxProps {
  title: string
  type: "fixed" | "dynamic"
  people: PersonNodeProps[]
  offDutyPeople?: PersonNodeProps[]
  offShiftPeople?: PersonNodeProps[]
  onRoadPeople?: PersonNodeProps[]
  remotePeople?: PersonNodeProps[]
  activeCount?: number
  totalAssigned?: number
  locationId?: string
  alerts?: number
  onEdit?: (locationId: string) => void
  onAssign?: (locationId: string) => void
  onViewTasks?: (locationId: string) => void
  onPersonClick?: (userId: string) => void
  /** Show absence reasons in the Off-Duty list — admins & managers only. */
  canSeeAbsenceReason?: boolean
  isExpanded?: boolean
  isOtherExpanded?: boolean
  isClosing?: boolean
  totalBoxes?: number
  layoutCols?: number
  layoutRows?: number
  forceVertical?: boolean
  onBoxClick?: (title: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  className?: string
}

type ViewMode = "normal" | "expanded" | "collapsed"

type SubPanel = "inField" | "offSite" | "offShift" | "offDuty" | null

export const WorkspaceBox = React.memo(React.forwardRef<HTMLDivElement, WorkspaceBoxProps>(function WorkspaceBox({
  title,
  type,
  people,
  activeCount,
  totalAssigned,
  locationId,
  alerts = 0,
  onEdit,
  onAssign,
  onViewTasks,
  onPersonClick,
  canSeeAbsenceReason = false,
  offDutyPeople = [],
  offShiftPeople = [],
  onRoadPeople = [],
  remotePeople = [],
  isExpanded = false,
  isOtherExpanded = false,
  isClosing = false,
  onBoxClick,
  onKeyDown,
  className,
}, ref) {
  const { t } = useTranslation()
  const isEmpty = people.length === 0
  const [subPanel, setSubPanel] = useState<SubPanel>(null)

  const handleSubPanelClick = useCallback((panel: SubPanel) => {
    setSubPanel(prev => prev === panel ? null : panel)
  }, [])

  // Reset sub-panel when box closes
  useEffect(() => {
    if (!isExpanded) setSubPanel(null)
  }, [isExpanded])

  if (type === "dynamic" && isEmpty) return null

  // Determine what to show
  const mode: ViewMode = isExpanded ? "expanded" : isOtherExpanded ? "collapsed" : "normal"

  const visibleCount = people.length + onRoadPeople.length + remotePeople.length
  const physicallyEmpty = people.length === 0 && visibleCount > 0
  const trulyEmpty = visibleCount === 0 && offShiftPeople.length === 0 && offDutyPeople.length === 0

  // Card width snaps to node columns so every card of the same size matches
  // exactly (an empty / 1-person card is always 1 node + padding — no variation
  // from title length). 1–4 columns; each column is a 76px node.
  // PAD_X = the card's p-3 padding (24) + 1px border ×2 (box-border) + ~5px of
  // slack, so N nodes actually fit on a row instead of wrapping down by ~2px.
  const NODE_W = 76, NODE_GAP = 8, PAD_X = 31
  const MAX_COLS = 4
  // Floor the 1-column size so an empty and a 1-person card are always the SAME
  // width AND wide enough to keep the "All quiet today" label on a single line
  // (a bare 1 node + padding = 100px is too narrow for the label to fit).
  const MIN_CARD_W = 140
  const shownNodes = people.length + onRoadPeople.length + remotePeople.length + offShiftPeople.length
  const wCols = Math.min(Math.max(shownNodes, 1), MAX_COLS)
  const cardWidth = Math.max(wCols * NODE_W + (wCols - 1) * NODE_GAP + PAD_X, MIN_CARD_W)

  // OPEN state is untouched — keep the original CSS-grid span placement so an
  // expanded space (and the collapsed strip beside it) looks exactly as before.
  // Only NORMAL (closed) cards get the new "fit its users" sizing.
  // Placement:
  //  • normal   → masonry column item (compact, equal gaps)
  //  • expanded → full-width row (flex-basis 100%), ordered after the chip strip
  //  • collapsed→ small chip in the strip above the expanded card
  const sizeStyle: React.CSSProperties = isExpanded
    ? { flex: 1, minWidth: 0 } // fills the open wrapper's width AND height
    : isOtherExpanded
      ? { flex: "0 0 116px", maxWidth: 116 } // compact chip in the strip
      : { width: cardWidth, flexShrink: 0 } // fixed node-column width (consistent per size)

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      data-tour="dash-space-box"
      aria-label={t("workspace.ariaLabel", { title, count: visibleCount })}
      aria-expanded={isExpanded}
      onKeyDown={onKeyDown}
      className={cn(
        "rounded-xl bg-card border border-border",
        "flex flex-col relative group/box outline-none",
        "outline-none",
        mode === "expanded" ? "cursor-default" : "cursor-pointer",
        mode === "expanded" && !isClosing && "ring-1 ring-primary/20 z-10",
        mode === "expanded" && "overflow-hidden",
        mode === "collapsed" && !isClosing && "opacity-60 hover:opacity-80",
        mode === "collapsed" && "overflow-hidden",
        mode === "normal" && "hover:bg-accent/30",
        trulyEmpty && mode !== "expanded" && "border-dashed opacity-50 hover:opacity-70",
        physicallyEmpty && mode !== "expanded" && "border-dashed opacity-75 hover:opacity-90",
        className,
      )}
      style={{
        ...sizeStyle,
        // Compact, content-height cards; the masonry columns keep gaps equal.
        minHeight: mode === "collapsed" ? 50 : 135,
        transform: mode === "collapsed" ? "scale(0.98)" : "scale(1)",
        transition: `all 0.7s ${APPLE_EASE}`,
      }}
      onClick={() => { if (!isExpanded) onBoxClick?.(title) }}
    >
      {/* Header */}
      <div className={cn(
        `flex items-center gap-1.5 px-3 shrink-0 transition-all duration-700 ${APPLE_EASE_CLASS}`,
        mode === "collapsed" ? "py-1" : "py-1.5",
      )}>
        <span className={cn(
          `font-bold uppercase tracking-wider text-foreground/80 truncate min-w-0 transition-all duration-700 ${APPLE_EASE_CLASS}`,
          mode === "collapsed" ? "text-[9px]" : isExpanded ? "text-xs" : "text-[10px]",
        )}>
          {title}
        </span>
        {totalAssigned != null && totalAssigned > 0 && !isExpanded && (
          <span className={cn(
            "ml-auto font-bold text-foreground/80 tabular-nums tracking-wider",
            mode === "collapsed" ? "text-[8px]" : "text-[10px]",
          )}>
            {activeCount ?? people.length}/{totalAssigned}
          </span>
        )}
        {isExpanded && (
          <div data-tour="dash-space-header" className="flex items-center gap-3 ml-3">
            {totalAssigned != null && totalAssigned > 0 && (
              <span className="text-xs text-foreground/80 font-bold tabular-nums">
                {activeCount ?? people.length}/{totalAssigned}
              </span>
            )}
            <span className="text-foreground/20">·</span>
            {people.length > 0 && (
              <span className="text-xs text-foreground/50 font-medium">
                <span className="text-foreground/80 font-bold">{people.length}</span> {t("workspace.present")}
              </span>
            )}
            {onRoadPeople.length > 0 && (
              <span className="text-xs text-foreground/50 font-medium">
                <span className="text-foreground/80 font-bold">{onRoadPeople.length}</span> {t("workspace.inField")}
              </span>
            )}
            {remotePeople.length > 0 && (
              <span className="text-xs text-foreground/50 font-medium">
                <span className="text-foreground/80 font-bold">{remotePeople.length}</span> {t("workspace.offSite")}
              </span>
            )}
            {offShiftPeople.length > 0 && (
              <span className="text-xs text-foreground/40 font-medium">
                <span className="text-foreground/60 font-bold">{offShiftPeople.length}</span> {t("workspace.offShift", "off-shift")}
              </span>
            )}
            {offDutyPeople.length > 0 && (
              <span className="text-xs text-foreground/40 font-medium">
                <span className="text-foreground/60 font-bold">{offDutyPeople.length}</span> {t("workspace.off")}
              </span>
            )}
          </div>
        )}
        {isExpanded && (
          <button
            onClick={(e) => { e.stopPropagation(); onBoxClick?.(title) }}
            className="ml-auto p-1 rounded-md hover:bg-accent/20 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-foreground/50" />
          </button>
        )}
      </div>

      {/* ═══ EXPANDED — worker cells + off duty box on right ═══ */}
      {mode === "expanded" && (<>
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
              { key: "offShift" as SubPanel, label: t("workspace.groupOffShift", "Off-shift"), people: offShiftPeople, variant: "cells" as const },
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
                      className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/50 hover:text-foreground/80 transition-colors self-start px-1"
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
                        <div className="flex-1 flex items-center justify-center text-xs text-foreground/30">{t("workspace.allAccountedFor")}</div>
                      )}
                    </div>
                  ) : activeGroup && activeGroup.people.length > 0 ? (
                    <div className="flex-1 grid grid-cols-[repeat(auto-fill,minmax(140px,160px))] gap-[5px] content-start">
                      {activeGroup.people.map((person, i) => (
                        <ExpandedWorkerCell key={`${person.name}-${i}`} person={person} delay={i * 0.04} onPersonClick={onPersonClick} dataTour={i === 0 ? "dash-space-member" : undefined} />
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
              className="group flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-medium text-foreground/70 bg-foreground/[0.08] hover:bg-foreground/[0.14] backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]"
            >
              <Settings className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
              {t("workspace.manageSpace")}
            </button>
          )}
          {onAssign && (
            <button
              onClick={(e) => { e.stopPropagation(); onAssign(locationId || "") }}
              className="group flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-medium text-primary-foreground bg-primary/80 hover:bg-primary transition-all duration-200 hover:scale-[1.02] shadow-sm shadow-primary/20"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("workspace.addMember")}
            </button>
          )}
          {onViewTasks && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewTasks(locationId || "") }}
              className="group flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-medium text-foreground/70 bg-foreground/[0.08] hover:bg-foreground/[0.14] backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              {t("workspace.viewTasks")}
            </button>
          )}
        </div>
      </>)}

      {/* ═══ COLLAPSED — stacked mini avatars + expand hint on hover ═══ */}
      {mode === "collapsed" && (
        <>
          {people.length > 0 && (
            <div className="flex items-center justify-center gap-0.5 px-2 pb-1">
              {people.slice(0, 4).map((p, i) => (
                <div
                  key={i}
                  className="size-4 rounded-full flex items-center justify-center text-white text-[6px] font-bold shrink-0"
                  style={{ background: p.color }}
                >
                  {p.initials}
                </div>
              ))}
              {people.length > 4 && (
                <span className="text-[7px] text-foreground/50 font-medium ml-0.5">
                  +{people.length - 4}
                </span>
              )}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/box:opacity-100 transition-opacity duration-200 bg-card/80 dark:bg-card/60 backdrop-blur-[2px] rounded-xl">
            <Maximize2 className="h-3 w-3 text-foreground/40" />
          </div>
        </>
      )}

      {/* ═══ NORMAL VIEW ═══ */}
      {mode === "normal" && (() => {
        // Show clocked-in people first, then off-shift (online, reachable).
        // Offline (off-duty) members are NOT shown here — they live only in the
        // expanded Off Duty group. Ring = clocked in, dot = availability.
        const allActive = [...people, ...onRoadPeople, ...remotePeople, ...offShiftPeople]
        const allEmpty = allActive.length === 0
        // Bounded, UNIFORM preview: show at most 12 members (4 per row × 3 rows).
        // Any overflow becomes a centered "+N more" pill. Combined with the card's
        // fixed height every card is the same size → equal spacing everywhere.
        const MAX_SHOWN = MAX_COLS * 3
        const shown = allActive.length > MAX_SHOWN ? allActive.slice(0, MAX_SHOWN) : allActive
        const extra = allActive.length - shown.length
        return (
          <>
            {allEmpty ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-3">
                <Ghost className="h-8 w-8 text-foreground/80" />
                <span className="text-xs text-foreground/80 font-medium whitespace-nowrap">{t("workspace.allQuietToday")}</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center gap-2 p-3">
                <div className="flex flex-wrap items-center content-center justify-center gap-2">
                  {shown.map((person, i) => (
                    <PersonNode key={`${person.name}-${i}`} {...person} />
                  ))}
                </div>
                {extra > 0 && (
                  <div className="flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/60">
                      +{extra} {t("workspace.more", "more")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )
      })()}

      {/* Expand hint — normal boxes on hover */}
      {mode === "normal" && (
        <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover/box:opacity-100 transition-all duration-200 scale-90 group-hover/box:scale-100">
          <div className="w-6 h-6 rounded-md bg-foreground/[0.06] dark:bg-foreground/[0.1] backdrop-blur-sm flex items-center justify-center">
            <Maximize2 className="h-3 w-3 text-foreground/30" />
          </div>
        </div>
      )}
    </div>
  )
}))

const StatusIcon = React.memo(function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "on":
      return <Circle className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
    case "busy":
      return <Briefcase className="h-3.5 w-3.5 text-blue-500" />
    case "away":
      return <Circle className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
    case "off":
      return <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
    default:
      return <Circle className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
  }
})

const SideStatusBox = React.memo(function SideStatusBox({ label, people, variant = "cells", onClick, dataTour }: { label: string; people: PersonNodeProps[]; variant?: "cells" | "dots"; onClick?: () => void; dataTour?: string }) {
  if (people.length === 0) return null
  return (
    <div
      data-tour={dataTour}
      className={cn(
        "rounded-lg bg-secondary border border-border/60 dark:bg-background/20 dark:border-border/20 p-2.5 flex-1 flex flex-col min-h-0 overflow-auto",
        onClick && "cursor-pointer hover:border-primary/30 hover:bg-secondary/80 dark:hover:bg-background/30 transition-colors",
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <div
        className="flex items-center justify-between shrink-0 sticky -top-2.5 z-10 pt-2 pb-2 mb-1.5 -mx-2.5 px-2.5 -mt-2.5 bg-secondary/80 dark:bg-background/60"
        style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
          {label}
        </span>
        <span className="text-[9px] font-bold text-foreground/40 tabular-nums">
          {people.length}
        </span>
      </div>
      {variant === "cells" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,90px))] gap-[4px] content-start flex-1">
          {people.map((person, i) => (
            <MiniWorkerCell key={`${person.name}-${i}`} person={person} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 content-start flex-1">
          {people.map((person, i) => (
            <div key={`${person.name}-${i}`} className="flex flex-col items-center gap-1" title={person.name}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white opacity-40 shrink-0 overflow-hidden"
                style={{ background: person.color }}
              >
                {person.imageUrl ? (
                  <img src={person.imageUrl} alt={person.initials} className="w-full h-full object-cover" />
                ) : (
                  person.initials
                )}
              </div>
              <span className="text-[8px] text-foreground/30 font-medium truncate w-full text-center">{person.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

const MiniWorkerCell = React.memo(function MiniWorkerCell({ person }: { person: PersonNodeProps }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md bg-card dark:bg-accent/40 border border-border/40 dark:border-border/30 flex flex-col h-[60px] min-w-[90px] shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between px-1.5 pt-1 shrink-0">
        <span className="text-[8px] font-semibold text-foreground/60 truncate">{person.name}</span>
        {person.status === "busy" && (
          <div className="shrink-0" title={t("workspace.busy")}>
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" fill="#ef4444" fillOpacity="0.15" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.3" />
              <rect x="6" y="8" width="6" height="5" rx="1" fill="#ef4444" />
              <path d="M7.5 8V6.5a1.5 1.5 0 0 1 3 0V8" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              <circle cx="9" cy="10.5" r="0.7" fill="white" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 flex items-end pl-1.5 pb-1.5">
        <WorkerAvatar
          initials={person.initials}
          color={person.color}
          status={person.status}
          clockedIn={person.clockedIn}
          imageUrl={person.imageUrl}
          hideDot
          className="[&>div:first-child]:!w-[30px] [&>div:first-child]:!h-[30px] [&>div:first-child]:!min-w-[30px] [&>div:first-child]:!min-h-[30px] [&>div:first-child]:!text-[11px]"
        />
      </div>
    </div>
  )
})

const ABSENCE_INFO: Record<string, { labelKey: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  time_off: { labelKey: "workspace.absenceReason.time_off", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10", icon: <CalendarOff className="h-3.5 w-3.5" /> },
  sick: { labelKey: "workspace.absenceReason.sick", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  day_off: { labelKey: "workspace.absenceReason.day_off", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/10", icon: <CalendarOff className="h-3.5 w-3.5" /> },
  unexcused: { labelKey: "workspace.absenceReason.unexcused", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-500/10", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
}

const OffDutyRow = React.memo(function OffDutyRow({ person, delay = 0, canSeeAbsenceReason = false }: { person: PersonNodeProps; delay?: number; canSeeAbsenceReason?: boolean }) {
  const { t } = useTranslation()
  // Absence reason (Sick / Unexcused / …) is HR-sensitive — admins & managers
  // only. And only when the reason is actually KNOWN (never default to
  // "Unexcused", which wrongly flags everyone who's simply off-shift).
  const info = canSeeAbsenceReason && person.absenceReason ? ABSENCE_INFO[person.absenceReason] : undefined

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/30 dark:bg-background/20 border border-border/30"
      style={{ animation: `expandCardIn 0.4s ${APPLE_EASE} ${delay}s both` }}
    >
      <div
        className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-white opacity-60"
        style={{ background: person.color }}
      >
        {person.imageUrl ? (
          <img src={person.imageUrl} alt={person.initials} className="w-full h-full object-cover opacity-100" />
        ) : (
          person.initials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground/70">{person.name}</div>
      </div>
      {info && (
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0", info.color, info.bgColor)}>
          {info.icon}
          {t(info.labelKey)}
        </div>
      )}
    </div>
  )
})

const ExpandedWorkerCell = React.memo(function ExpandedWorkerCell({
  person,
  delay = 0,
  onPersonClick,
  dataTour,
}: {
  person: PersonNodeProps
  delay?: number
  onPersonClick?: (userId: string) => void
  /** Optional `data-tour` anchor so the guide can spotlight a single teammate. */
  dataTour?: string
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <div
          data-tour={dataTour}
          role="button"
          tabIndex={0}
          className={cn(
            "rounded-lg bg-muted/50 dark:bg-background/30 border border-border/50 dark:border-border/30 flex flex-col h-[110px] outline-none",
            "cursor-pointer hover:border-primary/40 hover:bg-accent/40 transition-colors",
          )}
          style={{ animation: `expandCardIn 0.5s ${APPLE_EASE} ${delay}s both` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
            <span className="text-[11px] font-semibold text-foreground/70 truncate">{person.name}</span>
            {person.tag && (
              <span className={cn(
                "text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                person.tag.variant === "task" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                "bg-purple-500/15 text-purple-600 dark:text-purple-400",
              )}>
                {person.tag.text}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-end pl-3 pb-3">
            <WorkerAvatar
              initials={person.initials}
              color={person.color}
              status={person.status}
              clockedIn={person.clockedIn}
              imageUrl={person.imageUrl}
              hideDot
              className="[&>div:first-child]:!w-[58px] [&>div:first-child]:!h-[58px] [&>div:first-child]:!min-w-[58px] [&>div:first-child]:!min-h-[58px] [&>div:first-child]:!text-xl"
            />
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-80 rounded-2xl p-0 overflow-hidden shadow-2xl border-border/50">
        {isOpen && person.userId && (
          <WorkerDropdownContent person={person} onPersonClick={onPersonClick} onClose={() => setIsOpen(false)} />
        )}
        {isOpen && !person.userId && (
          <div className="p-4 text-center text-sm text-muted-foreground">{t("workspace.noProfileData")}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

/** Dropdown content that fetches real employee data */
function WorkerDropdownContent({
  person,
  onPersonClick,
  onClose,
}: {
  person: PersonNodeProps
  onPersonClick?: (userId: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { openChatWith } = useChat()
  const userId = person.userId!
  // O(1) identity check — you can't message/call yourself; show self actions.
  const isSelf = !!user?.id && user.id === userId
  const selfClock = isSelf && hasAccessModule(user ?? {}, "clock")
  const selfTimeOff = isSelf && hasAccessModule(user ?? {}, "time_off")

  const { data: detail } = useQuery({
    queryKey: ["employee", userId],
    queryFn: () => employeesApi.getById(userId),
    staleTime: 30000,
    enabled: !isSelf,
  })

  const emp = (detail as any)?.data || detail
  const stats = emp?.stats
  const tasksCompleted = stats?.tasks?.completed ?? 0
  const tasksActive = stats?.tasks?.inProgress ?? 0
  const hoursWeek = stats?.attendance?.hoursThisWeek ?? 0
  const onTimeRate = stats?.performance?.onTimeRate ?? 0
  const rating = stats?.performance?.customerRating ?? 0
  const ratingCount = stats?.performance?.ratingCount ?? 0
  const recentActivity = stats?.recentActivity?.slice(0, 3) || []
  const completionRate = stats?.performance?.completionRate ?? 0

  // Performance score adapts to worker type:
  // - Workers WITH customer ratings: 35% on-time + 35% completion + 30% rating
  // - Workers WITHOUT ratings: 50% on-time + 50% completion (no rating penalty)
  const hasCustomerRating = ratingCount > 0
  const perfScore = hasCustomerRating
    ? Math.round(onTimeRate * 0.35 + completionRate * 0.35 + (rating / 5) * 100 * 0.3)
    : Math.round(onTimeRate * 0.5 + completionRate * 0.5)

  // If no tasks at all yet, show neutral instead of 0
  const totalTasks = (stats?.tasks?.total ?? 0)
  const hasData = totalTasks > 0 || hoursWeek > 0
  const displayScore = hasData ? perfScore : null

  const perfColor = displayScore === null ? "text-muted-foreground" : displayScore >= 80 ? "text-green-500" : displayScore >= 60 ? "text-amber-500" : "text-red-500"
  const perfBg = displayScore === null ? "stroke-muted" : displayScore >= 80 ? "stroke-green-500" : displayScore >= 60 ? "stroke-amber-500" : "stroke-red-500"

  return (
    <>
      {/* ── Header ── */}
      <div className="relative px-4 pt-5 pb-4" style={{ background: person.color }}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/40" />
        <div className="relative flex items-end gap-3">
          <div className="rounded-full ring-2 ring-white/25 shadow-lg">
            <WorkerAvatar
              initials={person.initials}
              color={person.color}
              status={person.status}
              clockedIn={person.clockedIn}
              imageUrl={person.imageUrl}
              hideDot
              className="[&>div:first-child]:!w-[48px] [&>div:first-child]:!h-[48px] [&>div:first-child]:!min-w-[48px] [&>div:first-child]:!min-h-[48px] [&>div:first-child]:!text-base"
            />
          </div>
          <div className="flex-1 min-w-0 pb-0.5">
            <p className="text-sm font-bold text-white truncate drop-shadow-sm">
              {person.name}{isSelf ? ` ${t("workspace.you")}` : ""}
            </p>
            {emp?.position ? <p className="text-[11px] text-white/70">{emp.position}</p> : null}
          </div>
          {person.tag && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm shrink-0">
              {person.tag.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Performance + Stats ── */}
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Performance ring */}
        <div className="relative size-14 shrink-0">
          <svg className="size-14 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3" className="stroke-muted/50" />
            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3" className={perfBg}
              strokeDasharray={`${((displayScore ?? 0) / 100) * 125.6} 125.6`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-sm font-bold tabular-nums leading-none", perfColor)}>{displayScore ?? "—"}</span>
            <span className="text-[7px] text-muted-foreground uppercase">{t("workspace.score")}</span>
          </div>
        </div>

        {/* Stat columns */}
        <div className="flex-1 grid grid-cols-3 gap-1">
          <div className="text-center py-1.5 rounded-lg bg-muted/30">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">{tasksCompleted}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">{t("workspace.done")}</p>
          </div>
          <div className="text-center py-1.5 rounded-lg bg-muted/30">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">{tasksActive}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">{t("workspace.active")}</p>
          </div>
          <div className="text-center py-1.5 rounded-lg bg-muted/30">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">{Math.round(hoursWeek)}h</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">{t("workspace.thisWeek")}</p>
          </div>
        </div>
      </div>

      {/* ── Current Task ── */}
      {person.currentTask && (
        <div className="px-4 pb-3">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">{t("workspace.workingOn")}</p>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); router.push(`/tasks`) }}
            className="w-full text-left group flex items-center gap-2.5 px-3 py-2 rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/25 transition-colors"
          >
            <div className="size-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <p className="text-[11px] font-medium text-foreground truncate flex-1">{person.currentTask}</p>
            <ArrowUpRight className="size-3 text-muted-foreground/0 group-hover:text-blue-500 transition-colors shrink-0" />
          </button>
        </div>
      )}

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">{t("workspace.recent")}</p>
          <div className="space-y-0.5">
            {recentActivity.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                <div className={cn(
                  "size-1.5 rounded-full shrink-0",
                  item.type === "task_completed" ? "bg-green-500" :
                  item.type === "task_started" ? "bg-blue-500" :
                  item.type === "clock_in" ? "bg-emerald-500" : "bg-muted-foreground/40",
                )} />
                <p className="text-[10px] text-foreground/70 truncate flex-1">{item.description || item.title || t("workspace.activity")}</p>
                <span className="text-[9px] text-muted-foreground/50 shrink-0 tabular-nums">
                  {item.time || item.createdAt?.split("T")[0] || ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSelf ? (
        /* Self: profile lives in the top-right user menu — only show useful
           self-service shortcuts (no Message/Call, no profile/tasks links). */
        (selfClock || selfTimeOff) && (
          <>
            <div className="h-px bg-border" />
            <div className="px-3 py-2 flex items-center gap-1.5">
              {selfClock && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); router.push("/my/attendance") }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Clock className="size-3.5" />
                  {t("workspace.attendance")}
                </button>
              )}
              {selfTimeOff && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); router.push("/my/time-off") }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <CalendarOff className="size-3.5" />
                  {t("workspace.timeOff")}
                </button>
              )}
            </div>
          </>
        )
      ) : (
        <>
          <div className="h-px bg-border" />

          {/* ── Communication ── */}
          <div className="px-3 py-2 flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); openChatWith(userId) }}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-foreground text-background text-[11px] font-semibold hover:bg-foreground/90 transition-colors"
            >
              <MessageCircle className="size-3.5" />
              {t("workspace.message")}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); notify.success(t("workspace.voiceCallComingSoon")) }}
              className="size-8 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title={t("workspace.voiceCall")}
            >
              <Phone className="size-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); notify.success(t("workspace.videoCallComingSoon")) }}
              className="size-8 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title={t("workspace.videoCall")}
            >
              <Video className="size-3.5" />
            </button>
          </div>

          <div className="h-px bg-border" />

          {/* ── Footer Links ── */}
          <div className="px-3 py-1.5 flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); onPersonClick?.(userId) }}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <User className="size-3" />
              {t("workspace.profile")}
            </button>
            <div className="w-px h-4 bg-border" />
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); router.push(`/tasks`) }}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ClipboardList className="size-3" />
              {t("workspace.tasks")}
            </button>
          </div>
        </>
      )}
    </>
  )
}
