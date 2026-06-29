"use client"

import Link from "next/link"
import { FileQuestion } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export default function DashboardNotFound() {
  const { t } = useTranslation()
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="size-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="size-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t('errors.pageNotFound')}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('errors.pageNotFoundBody')}
        </p>
        <Button asChild>
          <Link href="/dashboard">{t('errors.goToDashboard')}</Link>
        </Button>
      </div>
    </div>
  )
}
