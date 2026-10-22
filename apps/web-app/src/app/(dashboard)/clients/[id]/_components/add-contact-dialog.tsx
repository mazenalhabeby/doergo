"use client"

import { Building2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { PhoneInput } from "@/components/ui/phone-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { useAddContactDialog, type AddContactDialogProps } from "../_hooks/use-add-contact-dialog"
import { PersonPickRow } from "@/components/common/person-pick-row"

/**
 * Attach a person, or create one.
 *
 * Search comes FIRST and the create form is behind it, because the whole point
 * is that a contact is a person you already have. A dialog that opened on a
 * blank form would produce a second Anna every time somebody was in a hurry.
 */
export function AddContactDialog({ companyId, onSaved, trigger, startName, mine }: AddContactDialogProps) {
  const {
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
  } = useAddContactDialog({ companyId, onSaved, startName, mine })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
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
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPersonId(null)
                  }}
                  placeholder={
                    mine ? t("customers.findCompanyPh", "Company name…") : t("customers.findPersonPh", "Name or email…")
                  }
                />
              </div>

              {search.trim().length >= 2 && (
                <div className="overflow-hidden rounded-lg border border-border">
                  {searchQ.isLoading ? (
                    <div className="p-2">
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("customers.noPersonFound", "Nobody found — create them instead.")}
                    </p>
                  ) : (
                    <ul className="max-h-52 divide-y divide-border overflow-y-auto">
                      {results.map((r) => (
                        <li key={r.id}>
                          <PersonPickRow
                            name={r.name}
                            /* Say where they already are rather than hiding them — that is what stops a duplicate. */
                            sub={
                              r.contactOf
                                ? t("customers.alreadyContactAt", "contact at {{name}}", { name: r.contactOf.name })
                                : r.email || r.phone || ""
                            }
                            selected={personId === r.id}
                            onClick={() => setPersonId(r.id)}
                            className="rounded-none px-3 py-2"
                          />
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
                <Label>
                  {t("customers.name", "Name")}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("customers.email", "Email")}</Label>
                <Input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              {/* Its own line here too — same reason as the client form: half a
                  dialog is not enough to read a number back. */}
              <div className="space-y-1">
                <Label>{t("customers.phone", "Phone")}</Label>
                <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              </div>
              {/* The sentence that makes this safe to use freely. */}
              <p className="rounded-lg bg-muted/50 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {t(
                  "customers.contactNotAClient",
                  "Saved as a contact of this company. They stay out of your client list " +
                    "and don’t count towards your client total — until you make them a client " +
                    "in their own right.",
                )}
              </p>
            </>
          )}

          <div className="space-y-1">
            <Label>
              {mine ? t("customers.myRoleThere", "Their role there") : t("customers.contactRole", "Their role here")}
            </Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={120}
              placeholder={t("customers.contactRolePh", "e.g. Facility Manager")}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={isPrimary} onCheckedChange={(v) => setIsPrimary(v === true)} />
            {t("customers.primaryContact", "Primary contact")}
          </label>

          {!mine && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "find" ? "create" : "find")
                setPersonId(null)
              }}
              className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
            >
              {mode === "find" ? (
                <>
                  <Plus className="h-3.5 w-3.5" /> {t("customers.createPerson", "Create a new person")}
                </>
              ) : (
                <>
                  <Building2 className="h-3.5 w-3.5" /> {t("customers.backToSearch", "Back to search")}
                </>
              )}
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending
              ? t("common.saving", "Saving…")
              : mine
                ? t("customers.addCompanyAction", "Add company")
                : t("customers.addContactAction", "Add contact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
