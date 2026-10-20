"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Mail, Phone, Star, Trash2, UserPlus, Users } from "lucide-react"

import { customersApi, type Customer, type CustomerContactLink } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Truncated } from "@/components/truncated"
import { Skeleton } from "@/components/ui/skeleton"

import { personInitials } from "@hbcfield/shared/client"
import { AddContactDialog } from "./add-contact-dialog"
export { WorksAtPanel } from "./works-at-panel"

/**
 * The people you actually deal with at a company.
 *
 * A company record has always had a free-text `contactName`. You cannot ring it,
 * filter by it, or see what was said to it — and when the same person is a
 * contact at two of your clients, their name is simply typed twice.
 *
 * This links the PERSON RECORD that already exists, so there is one Anna with
 * one history, appearing on both companies. Built in the same idiom as the
 * Managers and Addresses panels beside it: one card, an uppercase label, a blue
 * text link to add.
 */
export function ContactsPanel({ customer, canEdit }: { customer: Customer; canEdit: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const companyId = customer.id

  const q = useQuery({
    queryKey: keys.customers.contacts(companyId),
    queryFn: () => customersApi.contacts(companyId),
  })
  const contacts = q.data ?? []
  /*
    One link, three screens.

    Adding a contact changes what THREE places say: this company's panel, the
    clients list (which prints who to ring on the row), and — the one that was
    missed — the PERSON's own record, whose "Works at" panel is the other end of
    the very link just created. Without that last line somebody adds Ahmed to OMV
    here, opens Ahmed, and is shown the cached answer from before: no companies.

    Invalidated by prefix, so it does not matter which person the link was to.
  */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.customers.contacts(companyId) })
    qc.invalidateQueries({ queryKey: keys.customers.companies() })
    qc.invalidateQueries({ queryKey: keys.customers.lists() })
  }

  const setPrimary = useMutation({
    mutationFn: (linkId: string) => customersApi.updateContact(linkId, { isPrimary: true }),
    onSuccess: invalidate,
    onError: (e: Error) => notify.error(e.message || "Could not update"),
  })
  const remove = useMutation({
    mutationFn: (linkId: string) => customersApi.removeContact(linkId),
    // "Removed" and not "deleted", because the person record is kept — they may
    // work somewhere else tomorrow and their history is worth having either way.
    onSuccess: () => {
      notify.success(t("customers.contactRemoved", "Contact removed"))
      invalidate()
    },
    onError: (e: Error) => notify.error(e.message || "Could not remove"),
  })

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {t("customers.contacts", "Contact people")}
        </p>
        {canEdit && (
          <AddContactDialog
            companyId={companyId}
            onSaved={invalidate}
            trigger={
              <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <UserPlus className="h-3.5 w-3.5" /> {t("customers.addContact", "Add")}
              </button>
            }
          />
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("customers.noContacts", "Nobody added yet — attach a person you already have, or create one.")}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              link={c}
              canEdit={canEdit}
              onPrimary={() => setPrimary.mutate(c.id)}
              onRemove={() => remove.mutate(c.id)}
            />
          ))}
        </ul>
      )}

      {/*
        The name that was typed into the old field.

        It is not migrated — the column holds things like "Reception" and
        "Anna (mobile only)", and turning every one into a person record would
        mint hundreds of half-people, put them in the list and count them on the
        client ladder. It keeps working, and offers one click to become a person
        when somebody decides it is one.
      */}
      {canEdit && customer.contactName && !contacts.some((c) => c.person.name === customer.contactName) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
          <span className="min-w-0 text-[11.5px] text-muted-foreground">
            <span className="block text-[10px] font-semibold uppercase tracking-wider">
              {t("customers.contactNote", "Contact (note)")}
            </span>
            <Truncated text={customer.contactName} />
          </span>
          <AddContactDialog
            companyId={companyId}
            startName={customer.contactName}
            onSaved={invalidate}
            trigger={
              <button className="shrink-0 text-[11.5px] font-medium text-primary hover:underline">
                {t("customers.makeContactPerson", "Make a contact person")}
              </button>
            }
          />
        </div>
      )}
    </div>
  )
}

function ContactRow({
  link,
  canEdit,
  onPrimary,
  onRemove,
}: {
  link: CustomerContactLink
  canEdit: boolean
  onPrimary: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const p = link.person
  return (
    <li className="group flex items-start gap-2.5 py-2.5 first:pt-0.5">
      <span
        className={"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
          "bg-primary/10 text-[10px] font-semibold text-primary"}>
        {personInitials(p.name)}
      </span>
      <span className="min-w-0 flex-1">
        <a
          href={`/clients/${p.id}`}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-primary"
        >
          <Truncated text={p.name} />
          {link.isPrimary && (
            <span title={t("customers.primaryContact", "Primary contact")}>
              <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
            </span>
          )}
        </a>
        {link.role && <Truncated text={link.role} className="text-[11.5px] text-muted-foreground" />}
        {/* The two things somebody opened this panel to do. */}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
          {p.phone && (
            <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="h-3 w-3" />
              {p.phone}
            </a>
          )}
          {p.email && (
            <span className="inline-flex min-w-0 items-center gap-1 text-primary">
              <Mail className="h-3 w-3 shrink-0" />
              <Truncated text={p.email} href={`mailto:${p.email}`} className="hover:underline" />
            </span>
          )}
        </span>
      </span>
      {canEdit && (
        // Revealed on hover/focus — three buttons per row would make a small
        // panel read as a toolbar, and neither is used often.
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {!link.isPrimary && (
            <button
              onClick={onPrimary}
              title={t("customers.makePrimary", "Make primary contact")}
              className="rounded p-1 text-muted-foreground hover:text-amber-500"
            >
              <Star className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onRemove}
            title={t("common.remove", "Remove")}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </li>
  )
}
