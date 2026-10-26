"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { roleBadge, ROLE_COLOR_FALLBACK } from "@/lib/role-badge"
import type { OrgMember } from "@/lib/api"
import { Icon } from "@/components/ui/icon"
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
  if (member.role !== "ADMIN" && member.memberRole) {
    const named = member.memberRole
    return (
      <span className={ROLE_TAG}>
        <i
          aria-hidden
          className="size-[7px] shrink-0 rounded-[2px]"
          style={{ backgroundColor: named.color || ROLE_COLOR_FALLBACK }}
        />
        <span className="truncate">{named.name}</span>
      </span>
    )
  }
  /*
    One tag, carrying both facts. An owner is always an admin, so a separate Owner pill said the same thing twice;
    the owner's tag IS the admin tag, its square in ink and its word "Owner" (the board's reading). Everything else
    keeps a coloured square: external amber, an account type grey — one treatment for the whole column.
  */
  const conf = roleBadge(member.role, { isExternal: member.isExternal })
  const owner = member.isOwner === true
  return (
    <span className={ROLE_TAG} title={owner ? t("members.owner.title", "Owns this organization") : undefined}>
      <i
        aria-hidden
        className={cn(
          "size-[7px] shrink-0 rounded-[2px]",
          owner
            ? "bg-foreground"
            : member.isExternal
              ? "bg-shell-warn"
              : member.role === "ADMIN"
                ? "bg-shell-accent"
                : "bg-muted-foreground/50",
        )}
      />
      <span className="truncate">{owner ? t("members.owner.label", "Owner") : t(conf.labelKey)}</span>
      {owner && <span className="sr-only"> · {t(conf.labelKey)}</span>}
    </span>
  )
}

const ROLE_TAG = "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-foreground"

export function ScheduleBadge({ member }: { member: OrgMember }) {
  const { t } = useTranslation()
  const fixed = member.scheduleType === "FIXED"
  const flexible = member.scheduleType === "FLEXIBLE"
  if (!fixed && !flexible) return <span className="text-[13.5px] text-muted-foreground/40">{"\u2014"}</span>
  return (
    <span className="text-[13.5px] text-muted-foreground">
      {fixed ? t("members.schedule.fixed") : t("members.schedule.flexible")}
    </span>
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
  if (spaceNames.length === 0) {
    return <span className="text-[13px] italic text-muted-foreground/60">{t("members.noSpaces")}</span>
  }

  const shown = spaceNames.slice(0, SPACES_SHOWN)
  const rest = spaceNames.length - shown.length

  return (
    <Link
      href="/locations"
      title={spaceNames.join(", ")}
      className={
        "inline-flex min-w-0 max-w-full items-center gap-1.5 text-[13px] text-muted-foreground " +
        "transition-colors hover:text-foreground"
      }
    >
      <i aria-hidden className="size-1.5 shrink-0 rounded-full bg-shell-accent" />
      <span className="min-w-0 truncate">{shown.join(", ")}</span>
      {rest > 0 && (
        <span className="shrink-0 rounded-full bg-shell-chip px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
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
          aria-label={t("common.moreActions")}
          className={cn(
            "size-8 rounded-full text-muted-foreground transition-opacity",
            !alwaysVisible && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
          )}
        >
          <Icon name="moreDots" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onEdit(member)}>
          <Icon name="edit" size={16} className="mr-2" />
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
                <Icon name="shield" size={16} className="mr-2" />
                {t("members.owner.transfer", "Transfer ownership")}
              </DropdownMenuItem>
            )}
            {/*
              The owner cannot be removed — the server refuses until ownership
              moves. Saying so here beats offering the action and reporting the
              refusal afterwards, which is how somebody concludes it is broken.
            */}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={member.isOwner === true}
              title={
                member.isOwner
                  ? t("members.owner.cantRemove", "Transfer ownership before removing the owner")
                  : undefined
              }
              onClick={() => onRemove(member)}
            >
              <Icon name="userMinus" size={16} className="mr-2" />
              {t("members.actions.remove")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
