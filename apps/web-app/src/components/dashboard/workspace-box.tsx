"use client"

import React, { useState, useCallback, useEffect } from "react"
import { Ghost, X, Maximize2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { PersonNode } from "./person-node"
import { APPLE_EASE, APPLE_EASE_CLASS, type SubPanel } from "./workspace-box/constants"
import { ExpandedView } from "./workspace-box/expanded-view"
import { type WorkspaceBoxProps, WORKSPACE_CARD, workspaceCardCols, previewMembers } from "./workspace-box-layout"
export { type WorkspaceBoxProps, WORKSPACE_CARD, workspaceCardCols, previewMembers } from "./workspace-box-layout"

type ViewMode = "normal" | "expanded" | "collapsed"

export const WorkspaceBox = React.memo(
  React.forwardRef<HTMLDivElement, WorkspaceBoxProps>(function WorkspaceBox(
    {
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
    },
    ref,
  ) {
    const { t } = useTranslation()
    const isEmpty = people.length === 0
    const [subPanel, setSubPanel] = useState<SubPanel>(null)

    const handleSubPanelClick = useCallback((panel: SubPanel) => {
      setSubPanel((prev) => (prev === panel ? null : panel))
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

    const MAX_COLS = WORKSPACE_CARD.MAX_COLS
    const shownNodes = people.length + onRoadPeople.length + remotePeople.length + offShiftPeople.length
    // How many node columns this card grows to. The WIDTH follows from it in CSS
    // (`.ws-card` is max-content over `.ws-card-nodes`), so nothing here has to
    // predict what will fit.
    const cardCols = workspaceCardCols(shownNodes)

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
        : { flexShrink: 0 } // width comes from .ws-card (max-content over its columns)

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
          mode === "normal" && "ws-card hover:bg-accent/30",
          trulyEmpty && mode !== "expanded" && "border-dashed opacity-50 hover:opacity-70",
          physicallyEmpty && mode !== "expanded" && "border-dashed opacity-75 hover:opacity-90",
          className,
        )}
        style={{
          ...sizeStyle,
          // Consumed by .ws-card-nodes; the card's width follows from it.
          ["--ws-cols" as string]: String(cardCols),
          // Compact, content-height cards; the masonry columns keep gaps equal.
          minHeight: mode === "collapsed" ? 50 : WORKSPACE_CARD.MIN_H,
          transform: mode === "collapsed" ? "scale(0.98)" : "scale(1)",
          transition: `all 0.7s ${APPLE_EASE}`,
        }}
        onClick={() => {
          if (!isExpanded) onBoxClick?.(title)
        }}
      >
        {/* Header */}
        <div
          className={cn(
            `flex items-center gap-1.5 px-3 shrink-0 transition-all duration-700 ${APPLE_EASE_CLASS}`,
            mode === "collapsed" ? "py-1" : "py-1.5",
          )}
        >
          <span
            className={cn(
              `font-bold uppercase tracking-wider text-foreground/80 truncate min-w-0 transition-all duration-700 ${APPLE_EASE_CLASS}`,
              mode === "collapsed" ? "text-[9px]" : isExpanded ? "text-xs" : "text-[10px]",
            )}
          >
            {title}
          </span>
          {totalAssigned != null && totalAssigned > 0 && !isExpanded && (
            <span
              className={cn(
                "ml-auto font-bold text-foreground/80 tabular-nums tracking-wider",
                mode === "collapsed" ? "text-[8px]" : "text-[10px]",
              )}
            >
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
                  <span className="text-foreground/60 font-bold">{offShiftPeople.length}</span>{" "}
                  {t("workspace.offShift", "off-shift")}
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
              onClick={(e) => {
                e.stopPropagation()
                onBoxClick?.(title)
              }}
              className="ml-auto p-1 rounded-md hover:bg-accent/20 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-foreground/50" />
            </button>
          )}
        </div>

        {/* ═══ EXPANDED — worker cells + off duty box on right ═══ */}
        {mode === "expanded" && (
          <ExpandedView
            people={people}
            onRoadPeople={onRoadPeople}
            remotePeople={remotePeople}
            offShiftPeople={offShiftPeople}
            offDutyPeople={offDutyPeople}
            subPanel={subPanel}
            setSubPanel={setSubPanel}
            handleSubPanelClick={handleSubPanelClick}
            isClosing={isClosing}
            canSeeAbsenceReason={canSeeAbsenceReason}
            locationId={locationId}
            onEdit={onEdit}
            onAssign={onAssign}
            onViewTasks={onViewTasks}
            onPersonClick={onPersonClick}
          />
        )}

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
                  <span className="text-[7px] text-foreground/50 font-medium ml-0.5">+{people.length - 4}</span>
                )}
              </div>
            )}
            <div
              className={"absolute inset-0 flex items-center justify-center opacity-0 " +
                "group-hover/box:opacity-100 transition-opacity duration-200 bg-card/80 " +
                "dark:bg-card/60 backdrop-blur-[2px] rounded-xl"}>
              <Maximize2 className="h-3 w-3 text-foreground/40" />
            </div>
          </>
        )}

        {/* ═══ NORMAL VIEW ═══ */}
        {mode === "normal" &&
          (() => {
            // Show clocked-in people first, then off-shift (online, reachable).
            // Offline (off-duty) members are NOT shown here — they live only in the
            // expanded Off Duty group. Ring = clocked in, dot = availability.
            const allActive = previewMembers({ people, onRoadPeople, remotePeople, offShiftPeople })
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
                    <span className="text-xs text-foreground/80 font-medium whitespace-nowrap">
                      {t("workspace.allQuietToday")}
                    </span>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center gap-2 p-3">
                    <div className="ws-card-nodes">
                      {shown.map((person, i) => (
                        <PersonNode key={`${person.name}-${i}`} {...person} />
                      ))}
                      {extra > 0 && (
                        <div className="ws-card-more flex justify-center">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/60">
                            +{extra} {t("workspace.more", "more")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

        {/* Expand hint — normal boxes on hover */}
        {mode === "normal" && (
          <div
            className={"absolute bottom-1.5 right-1.5 opacity-0 group-hover/box:opacity-100 " +
              "transition-all duration-200 scale-90 group-hover/box:scale-100"}>
            <div className={"w-6 h-6 rounded-md bg-foreground/[0.06] dark:bg-foreground/[0.1] " + "backdrop-blur-sm flex items-center justify-center"}>
              <Maximize2 className="h-3 w-3 text-foreground/30" />
            </div>
          </div>
        )}
      </div>
    )
  }),
)
