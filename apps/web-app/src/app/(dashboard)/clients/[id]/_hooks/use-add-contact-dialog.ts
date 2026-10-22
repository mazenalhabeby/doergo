"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { customersApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

export interface AddContactDialogProps {
  companyId: string
  onSaved: () => void
  trigger: React.ReactNode
  /** Opens straight into the create form with this name — see the note below. */
  startName?: string
  /**
   * Adding from the OTHER end.
   *
   * On a person's record you pick the company they work at, so this record is
   * the `personId` and the one you choose becomes the `companyId`. Same link,
   * same endpoint, same checks — only which end is being chosen changes.
   */
  mine?: { personId: string }
}

/** AddContactDialog's state: find or create, the search, the chosen person, and saving the link. */
export function useAddContactDialog({
  companyId,
  onSaved,
  startName,
  mine,
}: Pick<AddContactDialogProps, "companyId" | "onSaved" | "startName" | "mine">) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"find" | "create">(startName ? "create" : "find")
  const [search, setSearch] = useState("")
  // The box answers at once; the request waits for the typing to settle.
  const debouncedSearch = useDebouncedValue(search, 300)
  const [personId, setPersonId] = useState<string | null>(null)
  const [role, setRole] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)
  const [form, setForm] = useState({ name: startName ?? "", email: "", phone: "" })

  const searchQ = useQuery({
    /*
      The right kind, asked of the server.

      On a company you are choosing a PERSON; on a person you are choosing a
      COMPANY. Filtering a fetched page instead would return eight rows and show
      two of them.

      Contacts are included on purpose: somebody who already contacts another
      company is exactly who you are looking for, and hiding them is how a
      duplicate gets created.
    */
    queryKey: keys.customers.list({
      search: debouncedSearch,
      limit: 8,
      contacts: "all",
      portalResident: false,
      type: mine ? "COMPANY" : "PERSON",
    }),
    queryFn: () =>
      customersApi.list({
        search: debouncedSearch,
        limit: 8,
        contacts: "all",
        portalResident: false,
        type: mine ? "COMPANY" : "PERSON",
      }),
    // Two characters, because one matches most of the book and the request is
    // wasted; the dialog is unusable without any search at all.
    enabled: open && debouncedSearch.trim().length >= 2,
  })
  // Everything the server returned, minus this record itself.
  const selfId = mine?.personId ?? companyId
  const results = (searchQ.data?.data ?? []).filter((c) => c.id !== selfId)

  const reset = () => {
    setMode(startName ? "create" : "find")
    setSearch("")
    setPersonId(null)
    setRole("")
    setIsPrimary(false)
    setForm({ name: startName ?? "", email: "", phone: "" })
  }

  const save = useMutation({
    mutationFn: () =>
      mine
        ? // From the person's side: the record they chose is the company, and THIS
          // record is the person.
          customersApi.addContact(personId!, { personId: mine.personId, role: role.trim() || undefined, isPrimary })
        : customersApi.addContact(companyId, {
            ...(mode === "find"
              ? { personId: personId! }
              : {
                  person: {
                    name: form.name.trim(),
                    email: form.email.trim() || undefined,
                    phone: form.phone.trim() || undefined,
                  },
                }),
            role: role.trim() || undefined,
            isPrimary,
          }),
    onSuccess: () => {
      notify.success(t("customers.contactAdded", "Contact added"))
      onSaved()
      setOpen(false)
      reset()
    },
    onError: (e: Error) => notify.error(e.message || "Could not add contact"),
  })

  const canSave = mine ? !!personId : mode === "find" ? !!personId : !!form.name.trim()

  return {
    t,
    open,
    setOpen,
    mode,
    setMode,
    search,
    setSearch,
    personId,
    setPersonId,
    role,
    setRole,
    isPrimary,
    setIsPrimary,
    form,
    setForm,
    searchQ,
    results,
    reset,
    save,
    canSave,
  }
}
