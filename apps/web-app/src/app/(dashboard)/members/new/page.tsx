"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
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
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/members">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("technicians.create.backToTechnicians")}
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">{t("technicians.create.accessDenied")}</h3>
            <p className="text-sm text-muted-foreground">{t("technicians.create.noPermission")}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <Link href="/members">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
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
