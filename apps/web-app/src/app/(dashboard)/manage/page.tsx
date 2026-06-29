"use client"

import Link from "next/link"
import { Users, Mail, UserPlus, Calendar, MapPin, ChevronRight, Workflow } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { hasAccessModule } from "@hbcfield/shared/client"

type Item = { href: string; label: string; desc: string; icon: typeof Users; show: boolean }

export default function ManagePage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const canSee = !user || hasAccessModule(user, "manage")

  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        {t('manage.noAccess')}
      </div>
    )
  }

  // Each management area is also permission-gated server-side; only surface what
  // this user can actually use so there are no dead links.
  const items: Item[] = [
    { href: "/members", label: t('manage.items.members.label'), desc: t('manage.items.members.desc'), icon: Users, show: !!user?.canManageUsers },
    { href: "/invitations", label: t('manage.items.invitations.label'), desc: t('manage.items.invitations.desc'), icon: Mail, show: !!user?.canManageUsers },
    { href: "/join-requests", label: t('manage.items.joinRequests.label'), desc: t('manage.items.joinRequests.desc'), icon: UserPlus, show: !!user?.canManageUsers || !!user?.canViewAllTasks },
    { href: "/schedule", label: t('manage.items.schedule.label'), desc: t('manage.items.schedule.desc'), icon: Calendar, show: !!user?.canViewAllTasks },
    { href: "/locations", label: t('manage.items.spaces.label'), desc: t('manage.items.spaces.desc'), icon: MapPin, show: !!user?.canManageUsers || !!user?.canViewAllTasks },
    { href: "/task-types", label: t('manage.items.taskTypes.label'), desc: t('manage.items.taskTypes.desc'), icon: Workflow, show: !!user?.canManageUsers },
  ]
  const visible = items.filter((i) => i.show)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t('manage.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('manage.subtitle')}</p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {t('manage.noPermissions')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map(({ href, label, desc, icon: Icon }) => (
            <Link key={href} href={href}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:shadow-sm hover:border-primary/40">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{label}</div>
                <div className="truncate text-xs text-muted-foreground">{desc}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
