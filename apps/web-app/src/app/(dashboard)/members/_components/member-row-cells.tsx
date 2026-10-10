"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Clock, Crown, MapPin, MoreHorizontal, Pencil, Timer, UserMinus } from "lucide-react"

import { cn } from "@/lib/utils"
import { roleBadge, ROLE_COLOR_FALLBACK } from "@/lib/role-badge"
import type { OrgMember } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// \u2500\u2500 Row sub-pieces (reused by the desktop table row AND the mobile card) \u2500\u2500\u2500\u2500\u2500\u2500


/**
 * The person who owns the organization.
 *
 * Separate from the role badge because it is a different fact: role says what
 * somebody can do, ownership says whose organization it is. An owner is always
 * an admin, so folding it into the role badge would hide one behind the other.
 */
export function RoleBadge({ member }: { member: OrgMember }) {
  const { t } = useTranslation()
  // Admin (system tier) always shows as Admin, even if it also carries a role row.
  if (member.role !== "ADMIN") {
    const named = member.memberRole
    if (named) {
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border gap-1.5"
          style={{ borderColor: named.color || undefined, color: named.color || undefined }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: named.color || ROLE_COLOR_FALLBACK }} />
          {named.name}
        </Badge>
      )
    }
  }
  /*
    One chip, carrying both facts.

    An owner is always an admin, so a separate Owner pill said the same thing
    twice and competed with the role for the same cell. The owner's badge IS the
    admin badge, in gold, with a crown standing where the dot stands on every
    other role — the frame and the icon say "owner" without a second element or a
    second word.

    Everything else keeps the coloured dot. The column mixed two treatments before
    — account types as solid tinted chips, named roles as an outline with a dot —
    so one list looked like two systems; they read the same way now, with colour
    telling them apart.
  */
  const conf = roleBadge(member.role, { isExternal: member.isExternal })
  const owner = member.isOwner === true
  return (
    <Badge
      variant="outline"
      title={owner ? t("members.owner.title", "Owns this organization") : undefined}
      className={cn(
        "gap-1.5 border text-xs font-medium",
        owner
          ? "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : conf.className,
      )}
    >
      {owner ? (
        <Crown className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <span className={cn("size-1.5 shrink-0 rounded-full", conf.dotClassName)} />
      )}
      {t(conf.labelKey)}
      {owner && <span className="sr-only"> · {t("members.owner.label", "Owner")}</span>}
    </Badge>
  )
}

export function ScheduleBadge({ member }: { member: OrgMember }) {
  const { t } = useTranslation()
  const fixed = member.scheduleType === "FIXED"
  const flexible = member.scheduleType === "FLEXIBLE"
  if (!fixed && !flexible) return <span className="text-sm text-muted-foreground/40">{"\u2014"}</span>
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium border gap-1",
        fixed
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
      )}
    >
      {fixed ? <Clock className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
      {fixed ? t("members.schedule.fixed") : t("members.schedule.flexible")}
    </Badge>
  )
}

/**
 * Which workspaces a member belongs to, in a fixed-width cell.
 *
 * ⚠️ Two faults, one symptom. The cell joined every name with commas, and a
 * member in four workspaces produced a string longer than the column — while
 * `truncate` sat inside an `inline-flex`, which is SHRINK-TO-FIT and grows to
 * whatever its content needs, so there was never a constrained width to
 * truncate against. The row swelled past the grid and the whole table picked up
 * a horizontal scrollbar because of one person.
 *
 * `max-w-full` gives the truncation something to bite on. The count does the
 * rest: one name is the common case and reads in full, and the member in four
 * shows "HBC Office +3" instead of three names nobody can read anyway. The full
 * list is on the title, for the moment somebody actually wants it.
 */
const SPACES_SHOWN = 1

export function SpacesCell({ spaceNames }: { spaceNames: string[] }) {
  const { t } = useTranslation()
  if (spaceNames.length === 0) return <span className="text-sm text-muted-foreground/50 italic">{t("members.noSpaces")}</span>

  const shown = spaceNames.slice(0, SPACES_SHOWN)
  const rest = spaceNames.length - shown.length

  return (
    <Link
      href="/locations"
      title={spaceNames.join(", ")}
      className="inline-flex max-w-full items-center gap-1.5 min-w-0 text-muted-foreground hover:text-primary transition-colors"
    >
      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="min-w-0 truncate text-sm">{shown.join(", ")}</span>
      {rest > 0 && (
        <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          +{rest}
        </span>
      )}
    </Link>
  )
}

export function RowActions({
  show,
  isSelf,
  member,
  onEdit,
  onRemove,
  onTransfer,
  canTransferOwnership,
  alwaysVisible,
}: {
  show: boolean
  isSelf?: boolean
  member: OrgMember
  onEdit: (m: OrgMember) => void
  onRemove: (m: OrgMember) => void
  onTransfer: (m: OrgMember) => void
  /** The viewer owns this organization — the only person who may hand it over. */
  canTransferOwnership: boolean
  alwaysVisible?: boolean
}) {
  const { t } = useTranslation()
  if (!show) return <div className="w-8" />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 transition-opacity", !alwaysVisible && "opacity-0 group-hover:opacity-100")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onEdit(member)}>
          <Pencil className="h-4 w-4 mr-2" />
          {t("common.edit")}
        </DropdownMenuItem>
        {/* You can edit your own profile, but you can't remove yourself. */}
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            {/*
              Handing the organization over. Shown only to the owner, and only on
              somebody else's row: it is the one action in the product that no
              permission grants, because an admin who could take ownership could
              then remove the founder.
            */}
            {/*
              Only to an admin, and never to an external member.

              The transfer makes its target the owner, and the server refuses
              both cases — offering it here would be a menu item whose only
              outcome is an error. An external member reaching it would mean
              handing a client's supervisor the organization.
            */}
            {canTransferOwnership && !member.isOwner && !member.isExternal && member.role === "ADMIN" && (
              <DropdownMenuItem onClick={() => onTransfer(member)}>
                <Crown className="h-4 w-4 mr-2" />
                {t("members.owner.transfer", "Transfer ownership")}
              </DropdownMenuItem>
            )}
            {/*
              The owner cannot be removed — the server refuses until ownership
              moves. Saying so here beats offering the action and reporting the
              refusal afterwards, which is how somebody concludes it is broken.
            */}
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              disabled={member.isOwner === true}
              title={member.isOwner ? t("members.owner.cantRemove", "Transfer ownership before removing the owner") : undefined}
              onClick={() => onRemove(member)}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              {t("members.actions.remove")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
