"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Plus, Star, Trash2 } from "lucide-react"
import { customersApi, type Customer } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Truncated } from "@/components/truncated"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { personInitials } from "@hbcfield/shared/client"
import { AddContactDialog } from "./add-contact-dialog"

/** The other end of a contact link: the companies this person works at — moved here unchanged. */
/**
 * The mirror, on a person's record: which companies they are a contact at.
 *
 * Worth as much read backwards — "who is this person?" is answered by who they
 * work for. Read-only here: the relationship is edited from the company, which
 * is the record that owns it, so there is one place to change it rather than two
 * that can disagree.
 */
export function WorksAtPanel({ customer, canEdit }: { customer: Customer; canEdit?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const promote = useMutation({
    mutationFn: () => customersApi.promoteContact(customer.id),
    onSuccess: () => {
      notify.success(t("customers.promoted", "Now a client in their own right"))
      qc.invalidateQueries({ queryKey: keys.customers.detail(customer.id) })
      qc.invalidateQueries({ queryKey: keys.customers.lists() })
    },
    onError: (e: Error) => notify.error(e.message || "Could not update"),
  })
  const q = useQuery({
    queryKey: keys.customers.companies(customer.id),
    queryFn: () => customersApi.contactCompanies(customer.id),
  })
  /*
    Does this organization have any companies at all?

    One row is enough to answer it, the key carries no customer id so every
    person record in a session shares the single request, and it is held for
    five minutes — a CRM does not gain its first company twice.
  */
  const anyCompanies =
    useQuery({
      queryKey: keys.customers.list({ type: "COMPANY", limit: 1 }),
      queryFn: () => customersApi.list({ type: "COMPANY", limit: 1 }),
      staleTime: 5 * 60_000,
      select: (r) => (r.data?.length ?? 0) > 0,
    }).data ?? false
  const companies = q.data ?? []
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.customers.companies(customer.id) })
    // …and the company's own panel, which is the other end of this link.
    qc.invalidateQueries({ queryKey: keys.customers.contacts() })
    qc.invalidateQueries({ queryKey: keys.customers.lists() })
  }
  const detach = useMutation({
    mutationFn: (linkId: string) => customersApi.removeContact(linkId),
    onSuccess: () => {
      notify.success(t("customers.contactRemoved", "Contact removed"))
      invalidate()
    },
    onError: (e: Error) => notify.error(e.message || "Could not remove"),
  })

  /*
    Most people in a CRM work nowhere in particular.

    A private client, a tenant, a lead somebody met at a trade fair — for all of
    them this panel is a card reserving space for a relationship that does not
    exist and usually never will. Shown on every person record it becomes
    furniture, and furniture is what people stop reading.

    So it appears when it has something to say, and otherwise shrinks to a single
    line offering the action. Three states, in order of how often they happen:

      • no companies in the whole CRM → nothing at all. Linking is impossible,
        and an action that opens an empty search is worse than no action.
      • companies exist, this person is at none → one quiet line, no card.
      • this person is at one or more → the panel.
  */
  if (q.isLoading) return null
  if (companies.length === 0) {
    if (!canEdit || !anyCompanies) return null
    return (
      <AddContactDialog
        companyId=""
        mine={{ personId: customer.id }}
        onSaved={invalidate}
        trigger={
          <button
            className={"flex w-full items-center gap-1.5 rounded-xl border border-dashed " +
              "border-border px-4 py-2.5 text-xs font-medium text-muted-foreground " +
              "transition-colors hover:border-border/80 hover:bg-muted/40 " +
              "hover:text-foreground"}>
            <Building2 className="h-3.5 w-3.5" />
            {t("customers.linkToCompany", "Link to a company")}
          </button>
        }
      />
    )
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> {t("customers.worksAt", "Works at")}
        </p>
        {canEdit && anyCompanies && (
          <AddContactDialog
            companyId=""
            mine={{ personId: customer.id }}
            onSaved={invalidate}
            trigger={
              <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> {t("customers.addCompany", "Add a company")}
              </button>
            }
          />
        )}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : (
        <ul className="divide-y divide-border/60">
          {companies.map((c) => (
            <li key={c.id} className="group flex items-start gap-2 py-2.5 first:pt-0.5">
              <a
                href={`/clients/${c.company.id}`}
                className="flex min-w-0 flex-1 items-start gap-2.5 hover:text-primary"
              >
                <span
                  className={"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md " +
                    "bg-muted text-[10px] font-semibold text-muted-foreground"}>
                  {personInitials(c.company.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <Truncated text={c.company.name} />
                    {c.isPrimary && (
                      <span title={t("customers.primaryContact", "Primary contact")}>
                        <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
                      </span>
                    )}
                  </span>
                  {c.role && <Truncated text={c.role} className="text-[11.5px] text-muted-foreground" />}
                </span>
              </a>
              {canEdit && (
                <button
                  onClick={() => detach.mutate(c.id)}
                  title={t("common.remove", "Remove")}
                  className={"shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
                    "hover:text-destructive focus-within:opacity-100 group-hover:opacity-100"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        The one button that turns somebody into a client.

        Said plainly, because it is the moment they start counting towards the
        client total — the whole reason a contact is cheap to add is that they
        do not until somebody decides this.
      */}
      {customer.isContact && customer.crmCaps?.manage && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {t(
              "customers.contactOnlyNote",
              "Added as a contact — not in your client list, and not counted towards your client total.",
            )}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={promote.isPending}
            onClick={() => promote.mutate()}
          >
            {promote.isPending ? t("common.saving", "Saving…") : t("customers.promote", "Make them a client")}
          </Button>
        </div>
      )}
    </div>
  )
}
