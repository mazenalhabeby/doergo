"use client"

import { useTranslation } from "react-i18next"
import {
  Plus, Building2, ChevronUp, ChevronDown, X, Clock, User, UserCheck, Handshake, HardHat,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The signing route, as an ordered list.
 *
 * Roles, never named people. Naming somebody on the TYPE means re-editing it
 * whenever they leave; a role keeps working, and who it resolves to is decided
 * per document when it is issued.
 *
 * Order is the route, so it is movable and the numbers are shown. A role can
 * appear once: the same role twice either asks one person to sign twice, which
 * the chain cannot distinguish, or means two different people, which the role
 * cannot express.
 */
export function RouteEditor({ route, onChange }: { route: string[]; onChange: (r: string[]) => void }) {
  const { t } = useTranslation()

  /*
    `ready: false` is offered but not addable.

    A client has no way to sign yet — no login unless a portal account was made
    for them, and the emailed-link route is not built. Adding the step would
    produce a document parked on somebody who cannot act, for ever. Showing it
    greyed out is more honest than hiding it: the intent is real and the reason
    it is unavailable is worth saying.
  */
  const ROLES = [
    { key: "MEMBER", Icon: User, ready: true },
    { key: "RESPONSIBLE", Icon: UserCheck, ready: true },
    { key: "ORG_REPRESENTATIVE", Icon: Building2, ready: true },
    /*
      The client's supervisor IS addable, where the client's own record is not.

      Both speak for the client and the difference is decisive: a supervisor is
      an external MEMBER of the space with a login, so they sign in session,
      today, with the stronger signature — while CUSTOMER waits on an emailed
      link that SMTP cannot currently deliver.
    */
    { key: "SITE_SUPERVISOR", Icon: HardHat, ready: true },
    { key: "CUSTOMER", Icon: Handshake, ready: false },
  ] as const

  const move = (i: number, by: number) => {
    const next = [...route]
    const j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const available = ROLES.filter((r) => !route.includes(r.key))

  return (
    <div className="mt-4">
      {route.length > 0 && (
        <ul className="mb-3 space-y-2">
          {route.map((role, i) => {
            const meta = ROLES.find((r) => r.key === role)
            const Icon = meta?.Icon ?? User
            return (
              <li
                key={role}
                className="flex items-center gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5"
              >
                <span
                  className={"flex size-7 shrink-0 items-center justify-center rounded-md " +
                    "bg-primary/10 text-xs font-semibold text-primary tabular-nums"}>
                  {i + 1}
                </span>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {t(`documents.types.route.roles.${role}`)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`documents.types.route.roleHints.${role}`)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={t("common.moveUp", "Move up")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === route.length - 1}
                    aria-label={t("common.moveDown", "Move down")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(route.filter((r) => r !== role))}
                    aria-label={t("common.remove", "Remove")}
                    className="rounded p-1 text-muted-foreground hover:text-red-600"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {available.map(({ key: k, Icon, ready }) => (
          <button
            key={k}
            type="button"
            disabled={!ready}
            title={ready ? undefined : t("documents.types.route.notReady")}
            onClick={() => onChange([...route, k])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1 text-sm transition-colors",
              ready
                ? "text-muted-foreground hover:border-primary/40 hover:text-foreground"
                : "cursor-not-allowed border-dashed text-muted-foreground/50",
            )}
          >
            {ready ? <Plus className="size-3.5" /> : <Clock className="size-3.5" />}
            <Icon className="size-3.5" />
            {t(`documents.types.route.roles.${k}`)}
            {!ready && (
              <span className="text-[10px] uppercase tracking-wide">
                {t("documents.types.route.soon")}
              </span>
            )}
          </button>
        ))}
        {available.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("documents.types.route.allAdded", "Every kind of signer is in the route.")}
          </p>
        )}
      </div>
    </div>
  )
}
