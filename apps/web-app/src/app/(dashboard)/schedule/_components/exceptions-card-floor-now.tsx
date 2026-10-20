"use client"

import { personName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Avatar } from "./exceptions-card-helpers"
import type { ExceptionsCardState } from "./use-exceptions-card"

/** Part of ExceptionsCard's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ExceptionsCardFloorNow({ vm }: { vm: ExceptionsCardState }) {
  const { t, here, line, soon, away } = vm
  return (
    <div className="border-t border-border px-4 py-3">
      <h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {t("cover.floorNow.working", "Working")}
        <span className="tabular-nums text-muted-foreground/80">{here.length}</span>
      </h4>
      {here.length ? (
        <div className="flex flex-wrap gap-2">
          {here.map((p) => {
            const l = line(p)
            return (
              <span
                key={p.id}
                className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-1.5 pr-3"
                title={`${personName(p)}${p.trade ? ` · ${p.trade}` : ""} — ${l.text}`}
              >
                <Avatar person={p} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium leading-tight">
                    {personName(p)}
                  </span>
                  <span className={cn("block max-w-[16ch] truncate text-[10.5px] leading-tight text-muted-foreground", l.tone)}>
                    {l.text}
                  </span>
                </span>
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t("cover.floorNow.nobodyIn", "Nobody has clocked in yet.")}</p>
      )}

      {(soon.length > 0 || away.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {soon.length > 0 && (
            <span>{t("cover.floorNow.dueSoon", "{{count}} due shortly", { count: soon.length })}</span>
          )}
          {away.length > 0 && (
            <>
              <span>{t("cover.floorNow.notExpected", "Not expected today:")}</span>
              {away.map((p) => (
                <span
                  key={p.id}
                  className={"inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 py-0.5 " +
                    "pl-0.5 pr-2.5 text-[11.5px] font-medium text-violet-700 " +
                    "dark:text-violet-300"}
                >
                  <Avatar person={p} />
                  {p.firstName}
                  {p.leaveUntil ? ` · ${t("cover.floorNow.back", "back {{date}}", { date: p.leaveUntil })}` : ""}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
