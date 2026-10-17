"use client"

import React from "react"
import { Circle, Briefcase, WifiOff } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { PersonNodeProps } from "../person-node"
import { WorkerAvatar } from "../worker-avatar"

export const StatusIcon = React.memo(function StatusIcon({ status }: { status: string }) {
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

export const SideStatusBox = React.memo(function SideStatusBox(
  {
    label,
    people,
    variant = "cells",
    onClick,
    dataTour
  }: { label: string; people: PersonNodeProps[]; variant?: "cells" | "dots"; onClick?: () => void; dataTour?: string }) {
  if (people.length === 0) return null
  return (
    <div
      data-tour={dataTour}
      className={cn(
        ("rounded-lg bg-secondary border border-border/60 dark:bg-background/20 " +
          "dark:border-border/20 p-2.5 flex-1 flex flex-col min-h-0 overflow-auto"),
        onClick && "cursor-pointer hover:border-primary/30 hover:bg-secondary/80 dark:hover:bg-background/30 transition-colors",
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <div
        className={"flex items-center justify-between shrink-0 sticky -top-2.5 z-10 pt-2 " +
          "pb-2 mb-1.5 -mx-2.5 px-2.5 -mt-2.5 bg-secondary/80 dark:bg-background/60"}
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
                className={"w-7 h-7 rounded-full flex items-center justify-center text-[9px] " +
                  "font-bold text-white opacity-40 shrink-0 overflow-hidden"}
                style={{ background: person.color }}
              >
                {person.imageUrl ? (
                  <img src={person.imageUrl} alt={person.initials} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
    <div
      className={"rounded-md bg-card dark:bg-accent/40 border border-border/40 " +
        "dark:border-border/30 flex flex-col h-[60px] min-w-[90px] shadow-sm " +
        "dark:shadow-none"}>
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
          className={"[&>div:first-child]:!w-[30px] [&>div:first-child]:!h-[30px] " +
            "[&>div:first-child]:!min-w-[30px] [&>div:first-child]:!min-h-[30px] " +
            "[&>div:first-child]:!text-[11px]"}
        />
      </div>
    </div>
  )
})
