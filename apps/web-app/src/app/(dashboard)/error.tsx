"use client"

import { useEffect } from "react"
import { ErrorFallback } from "@/components/error-boundary"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Dashboard Error]", error)
  }, [error])

  return <ErrorFallback error={error} reset={reset} />
}
