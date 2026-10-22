"use client"

import { useState, useEffect } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { organizationsApi, type OrgMember } from "@/lib/api"
import { copyText } from "@/lib/clipboard"

/** Resetting a member's password: the temporary one returned, shown once, and copying it. */
export function useMemberPasswordReset(member: OrgMember | null) {
  const { t } = useTranslation()
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // A (new) member opened starts with nothing shown.
  useEffect(() => {
    if (!member) return
    setTempPassword(null)
    setCopied(false)
  }, [member])

  const resetPasswordMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.resetMemberPassword(memberId),
    onSuccess: (data) => {
      if (data?.temporaryPassword) {
        setTempPassword(data.temporaryPassword)
        setCopied(false)
      }
    },
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToResetPassword")),
  })

  const handleCopyPassword = async () => {
    if (!tempPassword) return
    if (!(await copyText(tempPassword))) return
    setCopied(true)
    notify.copied("password")
    setTimeout(() => setCopied(false), 3000)
  }

  return { tempPassword, setTempPassword, copied, resetPasswordMutation, handleCopyPassword }
}
