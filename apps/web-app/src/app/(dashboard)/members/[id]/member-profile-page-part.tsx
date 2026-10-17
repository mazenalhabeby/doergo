"use client"

import { Mail, Cake } from "lucide-react"
import { dateLocale } from "@/lib/format-date"
import type { MemberProfilePageState } from "./use-member-profile-page"

/** Part of MemberProfilePage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MemberProfilePagePart({ vm }: { vm: MemberProfilePageState }) {
  const { member, memberLoading, memberError } = vm
  if ((memberLoading)) return null
  if ((memberError)) return null
  if ((!member)) return null
  return (
    <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5" />
        {member.email}
      </span>
      {/*
        Date of birth, and the birthday itself.

        ⚠️ Rendered from the "YYYY-MM-DD" string with `T12:00:00`,
        never `new Date("1990-03-01")`. That parses as midnight UTC
        and prints the 28th of February for anybody west of
        Greenwich — a person's birthday moving by a day depending on
        where they are reading it.
      */}
      {member.dateOfBirth && (
        <span className="flex items-center gap-1.5">
          <Cake className="h-3.5 w-3.5" />
          {new Date(`${member.dateOfBirth.slice(0, 10)}T12:00:00`).toLocaleDateString(
            dateLocale(),
            { day: "numeric", month: "short", year: "numeric" },
          )}
        </span>
      )}
    </div>
  )
}
