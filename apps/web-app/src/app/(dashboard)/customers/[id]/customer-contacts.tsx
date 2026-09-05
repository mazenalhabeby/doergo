"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Check, Mail, Phone, Plus, Star, Trash2, UserPlus, Users } from "lucide-react"

import { customersApi, type Customer, type CustomerContactLink } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/truncated"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { PhoneInput } from "@/components/ui/phone-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()

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
    queryKey: ["customer-contacts", companyId],
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
    qc.invalidateQueries({ queryKey: ["customer-contacts", companyId] })
    qc.invalidateQueries({ queryKey: ["customer-companies"] })
    qc.invalidateQueries({ queryKey: ["space-customers"] })
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
    onSuccess: () => { notify.success(t("customers.contactRemoved", "Contact removed")); invalidate() },
    onError: (e: Error) => notify.error(e.message || "Could not remove"),
  })

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {t("customers.contacts", "Contact people")}
        </p>
        {canEdit && (
          <AddContactDialog companyId={companyId} onSaved={invalidate} trigger={
            <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <UserPlus className="h-3.5 w-3.5" /> {t("customers.addContact", "Add")}
            </button>
          } />
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
          <AddContactDialog companyId={companyId} startName={customer.contactName} onSaved={invalidate} trigger={
            <button className="shrink-0 text-[11.5px] font-medium text-primary hover:underline">
              {t("customers.makeContactPerson", "Make a contact person")}
            </button>
          } />
        </div>
      )}
    </div>
  )
}

function ContactRow({ link, canEdit, onPrimary, onRemove }: {
  link: CustomerContactLink; canEdit: boolean; onPrimary: () => void; onRemove: () => void
}) {
  const { t } = useTranslation()
  const p = link.person
  return (
    <li className="group flex items-start gap-2.5 py-2.5 first:pt-0.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
        {initials(p.name)}
      </span>
      <span className="min-w-0 flex-1">
        <a href={`/customers/${p.id}`} className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-primary">
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
          {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3 w-3" />{p.phone}</a>}
          {p.email && <span className="inline-flex min-w-0 items-center gap-1 text-primary"><Mail className="h-3 w-3 shrink-0" /><Truncated text={p.email} href={`mailto:${p.email}`} className="hover:underline" /></span>}
        </span>
      </span>
      {canEdit && (
        // Revealed on hover/focus — three buttons per row would make a small
        // panel read as a toolbar, and neither is used often.
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {!link.isPrimary && (
            <button onClick={onPrimary} title={t("customers.makePrimary", "Make primary contact")}
              className="rounded p-1 text-muted-foreground hover:text-amber-500">
              <Star className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onRemove} title={t("common.remove", "Remove")}
            className="rounded p-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </li>
  )
}

/**
 * Attach a person, or create one.
 *
 * Search comes FIRST and the create form is behind it, because the whole point
 * is that a contact is a person you already have. A dialog that opened on a
 * blank form would produce a second Anna every time somebody was in a hurry.
 */
function AddContactDialog({ companyId, onSaved, trigger, startName, mine }: {
  companyId: string; onSaved: () => void; trigger: React.ReactNode
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
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"find" | "create">(startName ? "create" : "find")
  const [search, setSearch] = useState("")
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
    queryKey: ["contact-search", search, mine ? "COMPANY" : "PERSON"],
    queryFn: () =>
      customersApi.list({
        search, limit: 8, contacts: "all", portalResident: false,
        type: mine ? "COMPANY" : "PERSON",
      }),
    // Two characters, because one matches most of the book and the request is
    // wasted; the dialog is unusable without any search at all.
    enabled: open && search.trim().length >= 2,
  })
  // Everything the server returned, minus this record itself.
  const selfId = mine?.personId ?? companyId
  const results = (searchQ.data?.data ?? []).filter((c) => c.id !== selfId)

  const reset = () => {
    setMode(startName ? "create" : "find"); setSearch(""); setPersonId(null); setRole(""); setIsPrimary(false)
    setForm({ name: startName ?? "", email: "", phone: "" })
  }

  const save = useMutation({
    mutationFn: () =>
      mine
        // From the person's side: the record they chose is the company, and THIS
        // record is the person.
        ? customersApi.addContact(personId!, { personId: mine.personId, role: role.trim() || undefined, isPrimary })
        : customersApi.addContact(companyId, {
            ...(mode === "find" ? { personId: personId! } : { person: { name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined } }),
            role: role.trim() || undefined,
            isPrimary,
          }),
    onSuccess: () => { notify.success(t("customers.contactAdded", "Contact added")); onSaved(); setOpen(false); reset() },
    onError: (e: Error) => notify.error(e.message || "Could not add contact"),
  })

  const canSave = mine ? !!personId : mode === "find" ? !!personId : !!form.name.trim()

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mine
              ? t("customers.addCompany", "Add a company")
              : mode === "find"
                ? t("customers.addContact", "Add contact person")
                : t("customers.newContact", "New contact person")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {mine || mode === "find" ? (
            <>
              <div className="space-y-1">
                <Label>
                  {mine ? t("customers.findCompany", "Find a company") : t("customers.findPerson", "Find a person")}
                </Label>
                <Input autoFocus value={search} onChange={(e) => { setSearch(e.target.value); setPersonId(null) }}
                  placeholder={mine ? t("customers.findCompanyPh", "Company name…") : t("customers.findPersonPh", "Name or email…")} />
              </div>

              {search.trim().length >= 2 && (
                <div className="overflow-hidden rounded-lg border border-border">
                  {searchQ.isLoading ? (
                    <div className="p-2"><Skeleton className="h-8 w-full" /></div>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("customers.noPersonFound", "Nobody found — create them instead.")}
                    </p>
                  ) : (
                    <ul className="max-h-52 divide-y divide-border overflow-y-auto">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => setPersonId(r.id)}
                            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                              personId === r.id ? "bg-primary/5" : "hover:bg-muted/50")}>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                              {initials(r.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <Truncated text={r.name} className="font-medium text-foreground" />
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {/* Say where they already are rather than hiding
                                    them — that is what stops a duplicate. */}
                                {r.contactOf
                                  ? t("customers.alreadyContactAt", "contact at {{name}}", { name: r.contactOf.name })
                                  : r.email || r.phone || ""}
                              </span>
                            </span>
                            {personId === r.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>{t("customers.name", "Name")}<span className="text-destructive"> *</span></Label>
                <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("customers.email", "Email")}</Label>
                <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              {/* Its own line here too — same reason as the client form: half a
                  dialog is not enough to read a number back. */}
              <div className="space-y-1">
                <Label>{t("customers.phone", "Phone")}</Label>
                <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              </div>
              {/* The sentence that makes this safe to use freely. */}
              <p className="rounded-lg bg-muted/50 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {t("customers.contactNotAClient", "Saved as a contact of this company. They stay out of your client list and don’t count towards your client total — until you make them a client in their own right.")}
              </p>
            </>
          )}

          <div className="space-y-1">
            <Label>{mine ? t("customers.myRoleThere", "Their role there") : t("customers.contactRole", "Their role here")}</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120}
              placeholder={t("customers.contactRolePh", "e.g. Facility Manager")} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={isPrimary} onCheckedChange={(v) => setIsPrimary(v === true)} />
            {t("customers.primaryContact", "Primary contact")}
          </label>

          {!mine && (
          <button type="button" onClick={() => { setMode(mode === "find" ? "create" : "find"); setPersonId(null) }}
            className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline">
            {mode === "find"
              ? <><Plus className="h-3.5 w-3.5" /> {t("customers.createPerson", "Create a new person")}</>
              : <><Building2 className="h-3.5 w-3.5" /> {t("customers.backToSearch", "Back to search")}</>}
          </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving", "Saving…") : mine ? t("customers.addCompanyAction", "Add company") : t("customers.addContactAction", "Add contact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
      qc.invalidateQueries({ queryKey: ["customer", customer.id] })
      qc.invalidateQueries({ queryKey: ["space-customers"] })
    },
    onError: (e: Error) => notify.error(e.message || "Could not update"),
  })
  const q = useQuery({
    queryKey: ["customer-companies", customer.id],
    queryFn: () => customersApi.contactCompanies(customer.id),
  })
  /*
    Does this organization have any companies at all?

    One row is enough to answer it, the key carries no customer id so every
    person record in a session shares the single request, and it is held for
    five minutes — a CRM does not gain its first company twice.
  */
  const anyCompanies = useQuery({
    queryKey: ["crm-has-companies"],
    queryFn: () => customersApi.list({ type: "COMPANY", limit: 1 }),
    staleTime: 5 * 60_000,
    select: (r) => (r.data?.length ?? 0) > 0,
  }).data ?? false
  const companies = q.data ?? []
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customer-companies", customer.id] })
    // …and the company's own panel, which is the other end of this link.
    qc.invalidateQueries({ queryKey: ["customer-contacts"] })
    qc.invalidateQueries({ queryKey: ["space-customers"] })
  }
  const detach = useMutation({
    mutationFn: (linkId: string) => customersApi.removeContact(linkId),
    onSuccess: () => { notify.success(t("customers.contactRemoved", "Contact removed")); invalidate() },
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
      <AddContactDialog companyId="" mine={{ personId: customer.id }} onSaved={invalidate} trigger={
        <button className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/40 hover:text-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {t("customers.linkToCompany", "Link to a company")}
        </button>
      } />
    )
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> {t("customers.worksAt", "Works at")}
        </p>
        {canEdit && anyCompanies && (
          <AddContactDialog companyId="" mine={{ personId: customer.id }} onSaved={invalidate} trigger={
            <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> {t("customers.addCompany", "Add a company")}
            </button>
          } />
        )}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : (
        <ul className="divide-y divide-border/60">
          {companies.map((c) => (
            <li key={c.id} className="group flex items-start gap-2 py-2.5 first:pt-0.5">
              <a href={`/customers/${c.company.id}`} className="flex min-w-0 flex-1 items-start gap-2.5 hover:text-primary">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                  {initials(c.company.name)}
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
                <button onClick={() => detach.mutate(c.id)} title={t("common.remove", "Remove")}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-within:opacity-100 group-hover:opacity-100">
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
            {t("customers.contactOnlyNote", "Added as a contact — not in your client list, and not counted towards your client total.")}
          </p>
          <Button size="sm" variant="outline" className="w-full" disabled={promote.isPending} onClick={() => promote.mutate()}>
            {promote.isPending ? t("common.saving", "Saving…") : t("customers.promote", "Make them a client")}
          </Button>
        </div>
      )}
    </div>
  )
}
