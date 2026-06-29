"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    console.error("[GlobalError]", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="text-center max-w-md">
        <div className="size-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="size-8 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{t('errors.somethingWentWrong')}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t('errors.unexpectedNotified')}
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-xs text-left bg-muted rounded-lg p-3 mb-6 overflow-auto max-h-40 text-red-600">
            {error.message}
            {error.digest && `\nDigest: ${error.digest}`}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="size-4 mr-2" /> {t('common.tryAgain')}
          </Button>
          <Button onClick={() => window.location.href = "/dashboard"}>
            <Home className="size-4 mr-2" /> {t('common.goHome')}
          </Button>
        </div>
      </div>
    </div>
  )
}
