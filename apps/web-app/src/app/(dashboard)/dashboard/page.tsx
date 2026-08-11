"use client"

import dynamic from "next/dynamic"

const ClientDashboard = dynamic(
  () => import("./_components").then((m) => ({ default: m.ClientDashboard })),
)

// One dashboard for everyone. ClientDashboard branches internally on
// isAdminOrDispatcher (role === "ADMIN" || canViewAllTasks): admins AND managers
// get the full view; plain employees get the scoped spaces/tasks (or task-only)
// view. The old bespoke DispatcherDashboard is retired — managers now see the
// exact same screen as admins.
export default function DashboardPage() {
  return <ClientDashboard />
}
