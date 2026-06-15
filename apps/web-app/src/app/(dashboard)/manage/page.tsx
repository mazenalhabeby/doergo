"use client"

import Link from "next/link"
import { Users, Mail, UserPlus, Calendar, MapPin, ChevronRight, Workflow } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { hasAccessModule } from "@hbcfield/shared/client"

type Item = { href: string; label: string; desc: string; icon: typeof Users; show: boolean }

export default function ManagePage() {
  const { user } = useAuth()
  const canSee = !user || hasAccessModule(user, "manage")

  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        You don&apos;t have access to Manage.
      </div>
    )
  }

  // Each management area is also permission-gated server-side; only surface what
  // this user can actually use so there are no dead links.
  const items: Item[] = [
    { href: "/members", label: "Members", desc: "View and manage your team", icon: Users, show: !!user?.canManageUsers },
    { href: "/invitations", label: "Invitations", desc: "Invite people to the organization", icon: Mail, show: !!user?.canManageUsers },
    { href: "/join-requests", label: "Join Requests", desc: "Approve or reject join requests", icon: UserPlus, show: !!user?.canManageUsers || !!user?.canViewAllTasks },
    { href: "/schedule", label: "Schedule", desc: "Team availability and schedules", icon: Calendar, show: !!user?.canViewAllTasks },
    { href: "/locations", label: "Spaces", desc: "Manage workspaces and rosters", icon: MapPin, show: !!user?.canManageUsers || !!user?.canViewAllTasks },
    { href: "/task-types", label: "Task Types", desc: "Workflows + per-step widgets", icon: Workflow, show: !!user?.canManageUsers },
  ]
  const visible = items.filter((i) => i.show)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Manage</h1>
        <p className="text-sm text-muted-foreground">Management tools available to you.</p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          You have the Manage module, but no management permissions are enabled yet. Ask an admin to grant them.
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
