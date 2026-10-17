"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CustomerDetail } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useCompanies } from "@/components/companies/company-select"
import { clientLocaleFormValue, clientLocalePayload } from "@/lib/client-locale"
import { useActiveSpaces } from "@/hooks/use-space-directory"

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** CustomerForm's state and handlers — everything before its markup, moved here unchanged. */
export function useCustomerForm({ spaceId, existing, onSaved, trigger, personOnly }: Pick<{
  // personOnly = hide the Person/Company toggle and lock to Person (e.g. a
  // portal client / apartment resident is always a person).
  spaceId?: string; existing?: Customer; onSaved: (customer?: Customer) => void; trigger: React.ReactNode; personOnly?: boolean
}, 'spaceId' | 'existing' | 'onSaved' | 'trigger' | 'personOnly'>) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"PERSON" | "COMPANY">(personOnly ? "PERSON" : (existing?.type === "COMPANY" ? "COMPANY" : "PERSON"))
  const [form, setForm] = useState({
    name: existing?.name ?? "", email: existing?.email ?? "",
    phone: existing?.phone ?? "", notes: existing?.notes ?? "",
    legalName: existing?.legalName ?? "", website: existing?.website ?? "",
    industry: existing?.industry ?? "", vatId: existing?.vatId ?? "", regNumber: existing?.regNumber ?? "",
  })
  const [details, setDetails] = useState<CustomerDetail[]>(existing?.details ?? [])
  // "" = same as the organization; kept apart from `form` because it is sent as
  // null, not as an empty string, when nothing is chosen.
  const [locale, setLocale] = useState<string>(clientLocaleFormValue(existing))
  // null = the organization's currency (used for invoices outside a workspace).
  const [currency, setCurrency] = useState<string | null>(existing?.currency ?? null)
  // null = the main company issues this client's invoices outside a workspace.
  const [legalEntityId, setLegalEntityId] = useState<string | null>(existing?.legalEntityId ?? null)
  const { main: mainCompany } = useCompanies()

  /*
    Workspaces this client could belong to — those with the CRM module on.

    Same query key the nav and the space tabs use, so opening this dialog reuses
    what the page already fetched rather than asking again. Only consulted when
    the caller did not name a workspace and this is a new client; editing never
    moves one, which is a different action with different consequences.
  */
  // Asked when nobody has answered (new, from "All"), and shown when editing so
  // a client can be filed, moved or rescued from having no workspace at all.
  const needsSpace = !spaceId && !existing
  const canMoveSpace = !!existing && !existing.isPortalResident
  const showSpace = needsSpace || canMoveSpace
  const { data: activeSpaces } = useActiveSpaces({ enabled: open && showSpace })
  const crmSpaces = useMemo(() => {
    const all = activeSpaces ?? []
    // A space's own module list wins; an absent one inherits the organization's
    // — the same precedence useSpaceScope and the server's gates apply.
    return all.filter((sp) => {
      const mods = (Array.isArray(sp.enabledModules) ? sp.enabledModules : user?.orgModules ?? []) as string[]
      return mods.includes("crm")
    })
  }, [activeSpaces, user?.orgModules])
  const [chosenSpace, setChosenSpace] = useState<string>(existing?.spaceId ?? "")
  // One workspace is not a choice; answer it and say where it is going instead.
  const targetSpace = existing ? chosenSpace : spaceId ?? (crmSpaces.length === 1 ? crmSpaces[0].id : chosenSpace)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const emailInvalid = !!form.email && !isEmail(form.email)
  const isCompany = type === "COMPANY"

  const save = useMutation({
    mutationFn: () => {
      const cleanDetails = details.map((d) => ({ label: d.label.trim(), value: d.value.trim() })).filter((d) => d.label)
      const payload = {
        ...form, type,
        // Company-only fields are cleared when the record is a person.
        legalName: isCompany ? form.legalName : "",
        website: isCompany ? form.website : "",
        industry: isCompany ? form.industry : "",
        vatId: isCompany ? form.vatId : "",
        regNumber: isCompany ? form.regNumber : "",
        locale: clientLocalePayload(locale),
        currency,
        // Only when it changed: a client still pointing at a since switched-off company must stay editable.
        ...(legalEntityId !== (existing?.legalEntityId ?? null) ? { legalEntityId } : {}),
        details: cleanDetails,
      }
      return existing
        // Sent only when it actually changed — an unchanged workspace has no
        // business in a PATCH, and the server refuses a move for an app user.
        ? customersApi.update(
          existing.id,
          { ...payload, ...(canMoveSpace && chosenSpace !== (existing.spaceId ?? "") ? { spaceId: chosenSpace || null } : {}) })
        : customersApi.create({ ...payload, spaceId: targetSpace })
    },
    onSuccess: (customer) => { notify.success(
      existing
        ? t("customers.updated", "Customer updated")
        : t("customers.created", "Customer added")); onSaved(customer); setOpen(false) },
    onError: (e: Error) => notify.error(e.message || "Could not save"),
  })

  return {
    t,
    user,
    open,
    setOpen,
    type,
    setType,
    form,
    details,
    setDetails,
    locale,
    setLocale,
    currency,
    setCurrency,
    legalEntityId,
    setLegalEntityId,
    mainCompany,
    needsSpace,
    showSpace,
    crmSpaces,
    chosenSpace,
    setChosenSpace,
    targetSpace,
    set,
    emailInvalid,
    isCompany,
    save,
  }
}

/** What CustomerForm and its sections read. */
export type CustomerFormState = ReturnType<typeof useCustomerForm>
