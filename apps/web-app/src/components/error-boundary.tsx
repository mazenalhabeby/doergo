"use client"

import React from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo)

    if (typeof window !== "undefined") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sentry = (window as any).Sentry
        if (sentry && typeof sentry.captureException === "function") {
          sentry.captureException(error, {
            extra: { componentStack: errorInfo.componentStack },
          })
        }
      } catch {
        // Sentry not available, ignore
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return <ErrorFallback error={this.state.error} reset={this.handleReset} />
    }

    return this.props.children
  }
}

/**
 * Reusable error fallback UI used by both the class-based ErrorBoundary and
 * Next.js error.tsx pages.
 */
export function ErrorFallback({
  error,
  reset,
}: {
  error: Error | null
  reset: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="size-14 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="size-7 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t("errors.somethingWentWrong")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {error?.message || t("errors.unexpected")}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>
            <RefreshCw className="size-4 mr-2" />
            {t("common.tryAgain")}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/dashboard">{t("errors.goToDashboard")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
