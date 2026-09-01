"use client"

import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Users } from "lucide-react"

import { spaceRolesApi, spaceMembersApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/*
  Routing chosen as a ROLE, not as a person.

  A name goes stale. Whoever leads this site today leaves in March, and every
  member configured to route at them silently keeps routing at somebody who no
  longer works here — a document parked on a departed account is indistinguishable
  from one nobody has got to yet. A role does not leave: the person holding it
  changes, and the routing follows without anyone remembering to edit it.

  It also scales the way the company does. A picker over every member is a list
  that grows forever; the roles in a space are a handful and stay a handful.

  The holder count is not decoration. The document chain refuses to publish a
  step that resolves to nobody, and asks the issuer to choose when it resolves
  to several — so "3 people" here is a warning that every issue will stop and
  ask, and "nobody" is a warning that it will refuse outright. Saying so at the
  moment of configuring beats discovering it on payroll day.
*/
export function RoleField({
  spaceId,
  value,
  onChange,
  title,
  icon: Icon,
  emptyHint,
  /**
   * `single` replaces the pick and is used for sign-off, where the chain
   * resolves exactly one signer per step. Notification and contact are
   * genuinely plural — several roles can be told about somebody.
   */
  mode = "multi",
  /** Show how many people here hold each role. Only sign-off acts on it. */
  showHolderCount = false,
}: {
  spaceId: string
  value: string[]
  onChange: (roleIds: string[]) => void
  title: string
  icon: React.ComponentType<{ className?: string }>
  emptyHint: string
  mode?: "single" | "multi"
  showHolderCount?: boolean
}) {
  const { t } = useTranslation()

  const roles = useQuery({ queryKey: ["space-roles"], queryFn: () => spaceRolesApi.list() })
  const members = useQuery({
    queryKey: ["space-members", spaceId],
    queryFn: () => spaceMembersApi.list(spaceId),
  })

  // How many people in THIS space hold each role — the number that decides
  // whether issuing a document will go through, stop to ask, or refuse.
  const holders = new Map<string, number>()
  for (const m of members.data ?? []) {
    const id = m.spaceRole?.id
    if (id) holders.set(id, (holders.get(id) ?? 0) + 1)
  }

  const list = roles.data ?? []
  const selected = list.filter((r) => value.includes(r.id))

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{title}</p>
      </div>

      <div className="space-y-2 p-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm transition-colors hover:border-foreground/30"
            >
              <span className="min-w-0 flex-1 truncate">
                {selected.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {selected.map((r) => (
                      <span key={r.id} className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: r.color ?? "hsl(var(--muted-foreground))" }}
                        />
                        {r.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("scheduling.routing.chooseRole", "Choose a role…")}
                  </span>
                )}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1">
            <div className="max-h-64 overflow-y-auto">
              {list.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("scheduling.routing.noRoles", "No space roles exist yet. Create one above.")}
                </p>
              ) : (
                list.map((r) => {
                  const count = holders.get(r.id) ?? 0
                  const picked = value.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        onChange(
                          mode === "single"
                            ? picked
                              ? []
                              : [r.id]
                            : picked
                            ? value.filter((v) => v !== r.id)
                            : [...value, r.id],
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-accent/50",
                        picked && "bg-accent/30",
                      )}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: r.color ?? "hsl(var(--muted-foreground))" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                      {showHolderCount && (
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 text-[11px]",
                          count === 1 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500",
                        )}
                        title={
                          count === 1
                            ? undefined
                            : t(
                                "scheduling.routing.holderWarning",
                                "A document is refused when this resolves to nobody, and asks the issuer to choose when it resolves to several.",
                              )
                        }
                      >
                        <Users className="h-3 w-3" />
                        {count}
                      </span>
                      )}
                      {picked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        <p className="px-1 text-xs text-muted-foreground">
          {selected.length > 0 && showHolderCount
            ? t("scheduling.routing.approveResolves", {
                count: selected.reduce((n, r) => n + (holders.get(r.id) ?? 0), 0),
              })
            : selected.length > 0
            ? null
            : emptyHint}
        </p>
      </div>
    </div>
  )
}
