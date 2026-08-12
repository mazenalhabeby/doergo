"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import type { Contact } from "@hbcfield/shared/client";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Mail, Phone, Search } from "lucide-react";

type ContactForm = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  notes: string;
};

const emptyForm: ContactForm = {
  firstName: "",
  lastName: "",
  title: "",
  email: "",
  phone: "",
  isPrimary: false,
  notes: "",
};

function toForm(c: Contact): ContactForm {
  return {
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    title: c.title ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    isPrimary: c.isPrimary ?? false,
    notes: c.notes ?? "",
  };
}

function toPayload(f: ContactForm): Partial<Contact> {
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim() || null,
    title: f.title.trim() || null,
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    isPrimary: f.isPrimary,
    notes: f.notes.trim() || null,
  };
}

export default function ContactsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const contactsQ = useQuery({
    queryKey: ["crm-contacts", search],
    queryFn: () => crmApi.listContacts({ search: search || undefined }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => crmApi.deleteContact(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      notify.success("Contact deleted");
    },
    onError: (e: any) => notify.error(e.message || "Could not delete contact"),
  });

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (c: Contact) => {
    setEditing(c);
    setDialogOpen(true);
  };
  const onDelete = (c: Contact) => {
    if (window.confirm(`Delete ${c.firstName}${c.lastName ? " " + c.lastName : ""}?`)) {
      remove.mutate(c.id);
    }
  };

  const contacts = contactsQ.data?.items ?? [];
  const isLoading = contactsQ.isLoading;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-8"
          />
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 size-4" /> New contact
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-6" /></TableCell>
                </TableRow>
              ))
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {search ? "No contacts match your search." : "No contacts yet."}
                  </p>
                  {!search && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={openNew}>
                      <Plus className="mr-1.5 size-4" /> New contact
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {c.firstName} {c.lastName ?? ""}
                      </span>
                      {c.isPrimary && <Badge variant="secondary">Primary</Badge>}
                    </div>
                    {c.title && (
                      <div className="text-xs text-muted-foreground">{c.title}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <Mail className="size-3.5" /> {c.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-1.5 text-sm hover:underline"
                      >
                        <Phone className="size-3.5 text-muted-foreground" /> {c.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{c.space?.name ?? "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(c)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onDelete(c)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ContactDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editing}
      />
    </div>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContactForm>(contact ? toForm(contact) : emptyForm);
  const isEdit = !!contact;

  const set = <K extends keyof ContactForm>(k: K, v: ContactForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? crmApi.updateContact(contact!.id, toPayload(form))
        : crmApi.createContact(toPayload(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      notify.success(isEdit ? "Contact updated" : "Contact created");
      onOpenChange(false);
    },
    onError: (e: any) => notify.error(e.message || "Could not save contact"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact-firstName">First name</Label>
              <Input
                id="contact-firstName"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div>
              <Label htmlFor="contact-lastName">Last name</Label>
              <Input
                id="contact-lastName"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="contact-title">Title</Label>
            <Input
              id="contact-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Operations Manager"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>
            <div>
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="contact-isPrimary"
              checked={form.isPrimary}
              onCheckedChange={(v) => set("isPrimary", v === true)}
            />
            <Label htmlFor="contact-isPrimary" className={cn("cursor-pointer")}>
              Primary contact
            </Label>
          </div>
          <div>
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything worth remembering…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!form.firstName.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
