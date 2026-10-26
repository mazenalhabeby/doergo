"use client"

import Link from "next/link"
import type { IconName } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { useRouteAccess } from "@/hooks/use-route-access"
import { Icon } from "@/components/ui/icon"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PageHeader, Panel } from "@/components/page/page-kit"

type Item = { href: string; label: string; desc: string; icon: IconName; show: boolean }

export default function ManagePage() {
  const { offers } = useRouteAccess()
  const { t } = useTranslation()

  // The dashboard layout refuses this page to anyone without the `manage` screen
  // (lib/route-access). Each area below is asked of the same table, so the hub
  // offers exactly the pages this member can use — no dead links.
  const items: Item[] = [
    {
      href: "/members",
      label: t("manage.items.members.label"),
      desc: t("manage.items.members.desc"),
      icon: "people",
      show: offers("/members"),
    },
    {
      href: "/members/phone-sync",
      label: t("manage.items.phoneSync.label"),
      desc: t("manage.items.phoneSync.desc"),
      icon: "sync",
      show: offers("/members/phone-sync"),
    },
    {
      href: "/invitations",
      label: t("manage.items.invitations.label"),
      desc: t("manage.items.invitations.desc"),
      icon: "invite",
      show: offers("/invitations"),
    },
    {
      href: "/schedule",
      label: t("manage.items.schedule.label"),
      desc: t("manage.items.schedule.desc"),
      icon: "schedule",
      show: offers("/schedule"),
    },
    {
      href: "/locations",
      label: t("manage.items.spaces.label"),
      desc: t("manage.items.spaces.desc"),
      icon: "workspaces",
      show: offers("/locations"),
    },
    // No "Task types" entry: they belong to the space that runs them, so this
    // linked to the same place as Spaces above it — two rows, one destination.
  ]
  const visible = items.filter((i) => i.show)

  return (
    <div className={PAGE_SHELL}>
      <PageHeader tour="page-manage" title={t("manage.title")} subtitle={t("manage.subtitle")} />

      {visible.length === 0 ? (
        <Panel className="py-12 text-center text-sm text-muted-foreground">{t("manage.noPermissions")}</Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ href, label, desc, icon }) => (
            <Link
              key={href}
              href={href}
              className={
                "group flex items-center gap-3 rounded-[22px] border border-border bg-card p-[18px] shadow-shell " +
                "outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              }
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-shell-accent-soft text-shell-accent">
                <Icon name={icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-foreground">{label}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">{desc}</div>
              </div>
              <Icon
                name="chevronRight"
                size={16}
                className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
