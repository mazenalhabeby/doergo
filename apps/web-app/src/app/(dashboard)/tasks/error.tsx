"use client"

import { useEffect } from "react"
import { ErrorFallback } from "@/components/error-boundary"

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Tasks Error]", error)
  }, [error])

  return <ErrorFallback error={error} reset={reset} />
}
