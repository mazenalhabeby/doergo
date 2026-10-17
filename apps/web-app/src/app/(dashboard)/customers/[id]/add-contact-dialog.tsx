"use client"

import { Building2, Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/truncated"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { PhoneInput } from "@/components/ui/phone-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { personInitials } from "@hbcfield/shared/client"
import { useAddContactDialog } from "./use-add-contact-dialog"

/** Attach a contact person to a company — somebody already in the book, or somebody new — moved here unchanged. */
/**
 * Attach a person, or create one.
 *
 * Search comes FIRST and the create form is behind it, because the whole point
 * is that a contact is a person you already have. A dialog that opened on a
 * blank form would produce a second Anna every time somebody was in a hurry.
 */
export function AddContactDialog({
  companyId,
  onSaved,
  trigger,
  startName,
  mine,
}: {
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
}) {
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
  } = useAddContactDialog({ companyId, onSaved, trigger, startName, mine })

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
                          <button
                            type="button"
                            onClick={() => setPersonId(r.id)}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                              personId === r.id ? "bg-primary/5" : "hover:bg-muted/50",
                            )}
                          >
                            <span
                              className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
                                "bg-primary/10 text-[10px] font-semibold text-primary"}>
                              {personInitials(r.name)}
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
                  ("Saved as a contact of this company. They stay out of your client list " +
                    "and don’t count towards your client total — until you make them a client " +
                    "in their own right."),
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
