"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { NewMemberForm } from "./_components/new-member-form"
import { CreatedMemberDialog } from "./_components/created-member-dialog"

export default function NewTechnicianPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const [successDialog, setSuccessDialog] = useState(false)
  const [created, setCreated] = useState<{ email: string; generatedPassword: string } | null>(null)

  // Close success dialog
  const handleCloseSuccess = () => {
    setSuccessDialog(false)
    router.push("/members")
  }

  // Check if user can create employees (ADMIN or can-view-all-tasks)
  const canCreateEmployees = user?.role === "ADMIN" || hasPermission("canViewAllTasks")

  if (!canCreateEmployees) {
    return (
      <div className={`${PAGE_SHELL} space-y-4`}>
        <Link href="/members">
          <Button variant="ghost" size="pill" className="-ml-3 text-muted-foreground hover:text-foreground">
            <Icon name="backLine" />
            {t("technicians.create.backToTechnicians")}
          </Button>
        </Link>
        <Card className="rounded-[22px] shadow-shell">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">{t("technicians.create.accessDenied")}</h3>
            <p className="text-sm text-muted-foreground">{t("technicians.create.noPermission")}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`${PAGE_SHELL} space-y-4`}>
      {/* Back button */}
      <Link href="/members">
        <Button variant="ghost" size="pill" className="-ml-3 text-muted-foreground hover:text-foreground">
          <Icon name="backLine" />
          {t("technicians.create.backToTechnicians")}
        </Button>
      </Link>

      {/* Form */}
      <NewMemberForm
        onCreated={(result) => {
          setCreated(result)
          setSuccessDialog(true)
        }}
      />

      {/* Success Dialog with Generated Password */}
      <CreatedMemberDialog
        open={successDialog}
        onOpenChange={setSuccessDialog}
        email={created?.email ?? ""}
        generatedPassword={created?.generatedPassword ?? null}
        onDone={handleCloseSuccess}
      />
    </div>
  )
}
