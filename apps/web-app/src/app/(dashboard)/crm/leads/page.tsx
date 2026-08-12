"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import type { Lead } from "@hbcfield/shared/client";
import { LeadStatus } from "@hbcfield/shared/client";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Search, UserPlus2 } from "lucide-react";

const STATUS_VALUES = Object.values(LeadStatus) as LeadStatus[];

function statusVariant(status: LeadStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case LeadStatus.CONVERTED: return "default";
    case LeadStatus.QUALIFIED: return "secondary";
    case LeadStatus.UNQUALIFIED: return "destructive";
    default: return "outline";
  }
}

export default function LeadsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const statusParam = status === "all" ? undefined : status;
  const leadsQ = useQuery({
    queryKey: ["crm-leads", statusParam ?? "all", search],
    queryFn: () => crmApi.listLeads({ status: statusParam, search: search || undefined }),
  });

  const convert = useMutation({
    mutationFn: (id: string) => crmApi.convertLead(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-board"] });
      qc.invalidateQueries({ queryKey: ["crm-deals"] });
      notify.success(`Converted — deal "${res.deal.title}" created`);
    },
    onError: (e: any) => notify.error(e.message || "Could not convert lead"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => crmApi.deleteLead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      notify.success("Lead deleted");
    },
    onError: (e: any) => notify.error(e.message || "Could not delete lead"),
  });

  const onDelete = (lead: Lead) => {
    if (window.confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) {
      remove.mutate(lead.id);
    }
  };

  const leads = leadsQ.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative flex-1 min-w-[12rem] max-w-sm"
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search leads…"
            className="pl-8"
          />
        </form>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <LeadDialog
            trigger={<Button size="sm"><Plus className="mr-1.5 size-4" /> New lead</Button>}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsQ.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <UserPlus2 className="size-8 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">No leads yet</div>
                      <div className="text-sm text-muted-foreground">
                        {search || statusParam ? "Try adjusting your filters." : "Create your first lead to start tracking prospects."}
                      </div>
                    </div>
                    <LeadDialog trigger={<Button size="sm"><Plus className="mr-1.5 size-4" /> New lead</Button>} />
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="font-medium leading-tight">{lead.name}</div>
                    {lead.company && (
                      <div className="text-xs text-muted-foreground">{lead.company}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{lead.email || "—"}</div>
                    {lead.phone && <div className="text-xs text-muted-foreground">{lead.phone}</div>}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{lead.source || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <LeadDialog
                          lead={lead}
                          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit</DropdownMenuItem>}
                        />
                        {lead.status !== LeadStatus.CONVERTED && (
                          <DropdownMenuItem
                            onSelect={() => convert.mutate(lead.id)}
                            disabled={convert.isPending}
                          >
                            Convert
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onDelete(lead)}
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
    </div>
  );
}

function LeadDialog({ lead, trigger }: { lead?: Lead; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const isEdit = !!lead;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(lead?.name ?? "");
  const [company, setCompany] = useState(lead?.company ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? LeadStatus.NEW);
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [address, setAddress] = useState(lead?.address ?? "");
  const [lat, setLat] = useState(lead?.lat != null ? String(lead.lat) : "");
  const [lng, setLng] = useState(lead?.lng != null ? String(lead.lng) : "");

  const reset = () => {
    setName(lead?.name ?? "");
    setCompany(lead?.company ?? "");
    setEmail(lead?.email ?? "");
    setPhone(lead?.phone ?? "");
    setSource(lead?.source ?? "");
    setStatus(lead?.status ?? LeadStatus.NEW);
    setNotes(lead?.notes ?? "");
    setAddress(lead?.address ?? "");
    setLat(lead?.lat != null ? String(lead.lat) : "");
    setLng(lead?.lng != null ? String(lead.lng) : "");
  };

  const buildPayload = (): Partial<Lead> => {
    const parsedLat = lat.trim() === "" ? null : Number(lat);
    const parsedLng = lng.trim() === "" ? null : Number(lng);
    return {
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: source.trim() || null,
      status,
      notes: notes.trim() || null,
      address: address.trim() || null,
      lat: Number.isFinite(parsedLat as number) ? parsedLat : null,
      lng: Number.isFinite(parsedLng as number) ? parsedLng : null,
    };
  };

  const save = useMutation({
    mutationFn: () => (isEdit ? crmApi.updateLead(lead!.id, buildPayload()) : crmApi.createLead(buildPayload())),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      notify.success(isEdit ? "Lead updated" : "Lead created");
      setOpen(false);
    },
    onError: (e: any) => notify.error(e.message || "Could not save lead"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (o) reset(); }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lead-name">Name</Label>
            <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
            </div>
            <div>
              <Label htmlFor="lead-source">Source</Label>
              <Input id="lead-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Website, referral…" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" />
            </div>
            <div>
              <Label htmlFor="lead-phone">Phone</Label>
              <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+43 …" />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="lead-address">Address</Label>
            <Input id="lead-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-lat">Latitude</Label>
              <Input id="lead-lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="47.9813" inputMode="decimal" />
            </div>
            <div>
              <Label htmlFor="lead-lng">Longitude</Label>
              <Input id="lead-lng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="13.8269" inputMode="decimal" />
            </div>
          </div>
          <div>
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, next steps…" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()} className={cn(save.isPending && "opacity-80")}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
