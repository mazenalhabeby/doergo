"use client"

import { useAuth } from "@/contexts/auth-context"
import { ClientDashboard, DispatcherDashboard } from "./_components"

export default function DashboardPage() {
  const { user } = useAuth()
  const isDispatcher = user?.role === "DISPATCHER"

  return (
    <div className="p-6">
      {isDispatcher ? <DispatcherDashboard /> : <ClientDashboard />}
    </div>
  )
}
