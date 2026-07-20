"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Search, Pencil, Trash2, Building2, Mail, Phone } from "lucide-react"

import { customersApi, type Customer, type CustomerInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const EMPTY: CustomerInput = { name: "", contactName: "", email: "", phone: "", address: "", notes: "" }

export default function CustomersPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Customer | null | "new">(null)
  const [removeTarget, setRemoveTarget] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerInput>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => customersApi.list({ search: search || undefined, limit: 100 }),
  })
  const customers = data?.data || []

  const openCreate = () => { setForm(EMPTY); setEditing("new") }
  const openEdit = (c: Customer) => {
    setForm({ name: c.name, contactName: c.contactName ?? "", email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" })
    setEditing(c)
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing === "new") return customersApi.create(form)
      if (editing) return customersApi.update(editing.id, form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] })
      setEditing(null)
      notify.success(t("customers.saved", "Customer saved"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const remove = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] })
      setRemoveTarget(null)
      notify.success(t("customers.removed", "Customer deactivated"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header — matches the app's standard page header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">{t("customers.title", "Customers")}</h1>
            <p className="mt-1.5 text-muted-foreground">{t("customers.subtitle", "The people and companies you do work for.")}</p>
          </div>
          <Button onClick={openCreate} className="h-11 rounded-xl shadow-sm gap-1.5"><Plus className="h-4 w-4" />{t("customers.add", "Add customer")}</Button>
        </div>

        <div className="mb-6 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("customers.search", "Search customers…")} className="pl-9" />
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t("customers.empty", "No customers yet. Add your first one.")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {customers.map((c) => (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 font-semibold text-sm">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {c.contactName && <span className="truncate">{c.contactName}</span>}
                      {c.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1 truncate"><Phone className="h-3 w-3" />{c.phone}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setRemoveTarget(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("customers.add", "Add customer") : t("customers.edit", "Edit customer")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("customers.name", "Name")} *</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ACME Corp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("customers.contact", "Contact")}</Label>
                <Input value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("customers.phone", "Phone")}</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("customers.email", "Email")}</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("customers.address", "Address")}</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name?.trim() || save.isPending}>
              {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.removeTitle", "Deactivate customer?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("customers.removeDesc", "{{name}} will be hidden from lists. Existing tasks and reports keep their link.", { name: removeTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => removeTarget && remove.mutate(removeTarget.id)} disabled={remove.isPending}>
              {t("customers.deactivate", "Deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
