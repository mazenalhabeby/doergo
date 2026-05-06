"use client"

import dynamic from "next/dynamic"
import { useAuth } from "@/contexts/auth-context"

const ClientDashboard = dynamic(
  () => import("./_components").then((m) => ({ default: m.ClientDashboard })),
)
const DispatcherDashboard = dynamic(
  () =>
    import("./_components").then((m) => ({ default: m.DispatcherDashboard })),
)

export default function DashboardPage() {
  const { user } = useAuth()
  const isDispatcher = user?.role === "DISPATCHER"

  return (
    <div className="flex flex-1">
      {isDispatcher ? <DispatcherDashboard /> : <ClientDashboard />}
    </div>
  )
}
