"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import { QuoteStatus, type Quote, type QuoteLineItem } from "@hbcfield/shared/client";
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
import { Plus, MoreHorizontal, Send, Check, FileText, Trash2 } from "lucide-react";
import { formatMoney, toCents } from "../_lib/format";

const ALL = "ALL";
const STATUSES = Object.values(QuoteStatus) as QuoteStatus[];

function statusVariant(status: QuoteStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case QuoteStatus.ACCEPTED: return "default";
    case QuoteStatus.SENT: return "secondary";
    case QuoteStatus.DECLINED:
    case QuoteStatus.EXPIRED: return "destructive";
    default: return "outline"; // DRAFT
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function QuotesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>(ALL);

  const quotesQ = useQuery({
    queryKey: ["crm-quotes", status],
    queryFn: () => crmApi.listQuotes(status === ALL ? {} : { status }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-quotes"] });

  const setStatusM = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => crmApi.setQuoteStatus(id, next),
    onSuccess: () => { invalidate(); notify.success("Quote updated"); },
    onError: (e: any) => notify.error(e.message || "Could not update quote"),
  });

  const convert = useMutation({
    mutationFn: (id: string) => crmApi.convertQuoteToInvoice(id),
    onSuccess: (res) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["invoices"] });
      notify.success(`Invoice ${res.invoiceNumber} created`);
    },
    onError: (e: any) => notify.error(e.message || "Could not create invoice"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => crmApi.deleteQuote(id),
    onSuccess: () => { invalidate(); notify.success("Quote deleted"); },
    onError: (e: any) => notify.error(e.message || "Could not delete quote"),
  });

  const items = quotesQ.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <NewQuoteDialog />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Valid until</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotesQ.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <FileText className="size-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">No quotes yet.</div>
                    <NewQuoteDialog
                      trigger={<Button size="sm"><Plus className="mr-1.5 size-4" /> New quote</Button>}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.quoteNumber}</TableCell>
                  <TableCell>{q.clientName}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(q.status)}>{q.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(q.totalCents, q.currency)}
                  </TableCell>
                  <TableCell>{formatDate(q.validUntil)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {q.status === QuoteStatus.DRAFT && (
                          <DropdownMenuItem
                            onClick={() => setStatusM.mutate({ id: q.id, next: QuoteStatus.SENT })}
                          >
                            <Send className="mr-2 size-4" /> Mark sent
                          </DropdownMenuItem>
                        )}
                        {q.status !== QuoteStatus.ACCEPTED && (
                          <DropdownMenuItem
                            onClick={() => setStatusM.mutate({ id: q.id, next: QuoteStatus.ACCEPTED })}
                          >
                            <Check className="mr-2 size-4" /> Mark accepted
                          </DropdownMenuItem>
                        )}
                        {!q.invoiceId && (
                          <DropdownMenuItem onClick={() => convert.mutate(q.id)}>
                            <FileText className="mr-2 size-4" /> Create invoice
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => remove.mutate(q.id)}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete
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

type DraftLine = { description: string; quantity: string; unitPrice: string };

const emptyLine = (): DraftLine => ({ description: "", quantity: "1", unitPrice: "" });

function NewQuoteDialog({ trigger }: { trigger?: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const reset = () => {
    setClientName(""); setClientEmail(""); setTaxRate(""); setDiscount("");
    setNotes(""); setLines([emptyLine()]);
  };

  const totals = useMemo(() => {
    const subtotalCents = lines.reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      return sum + qty * toCents(l.unitPrice);
    }, 0);
    const discountCents = toCents(discount);
    const rate = (Number(taxRate) || 0) / 100;
    const taxCents = Math.round((subtotalCents - discountCents) * rate);
    const totalCents = subtotalCents - discountCents + taxCents;
    return { subtotalCents, discountCents, taxCents, totalCents, rate };
  }, [lines, discount, taxRate]);

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const create = useMutation({
    mutationFn: () => {
      const lineItems: QuoteLineItem[] = lines
        .filter((l) => l.description.trim())
        .map((l) => {
          const quantity = Number(l.quantity) || 0;
          const unitPriceCents = toCents(l.unitPrice);
          return { description: l.description.trim(), quantity, unitPriceCents, amountCents: quantity * unitPriceCents };
        });
      return crmApi.createQuote({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        lineItems,
        taxRate: totals.rate || undefined,
        discountCents: totals.discountCents || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-quotes"] });
      notify.success("Quote created");
      setOpen(false);
      reset();
    },
    onError: (e: any) => notify.error(e.message || "Could not create quote"),
  });

  const hasLine = lines.some((l) => l.description.trim());
  const canSubmit = clientName.trim().length > 0 && hasLine && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Plus className="mr-1.5 size-4" /> New quote</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="q-client">Client name</Label>
              <Input id="q-client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme GmbH" />
            </div>
            <div>
              <Label htmlFor="q-email">Client email</Label>
              <Input id="q-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="billing@acme.com" />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-1.5 size-4" /> Add row
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => {
                const qty = Number(l.quantity) || 0;
                const amount = qty * toCents(l.unitPrice);
                return (
                  <div key={i} className="flex items-start gap-2">
                    <Input
                      className="flex-1"
                      value={l.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Description"
                    />
                    <Input
                      className="w-16"
                      value={l.quantity}
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      inputMode="numeric"
                      placeholder="Qty"
                    />
                    <Input
                      className="w-28"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                      inputMode="decimal"
                      placeholder="Unit price"
                    />
                    <div className="w-24 pt-2 text-right text-sm tabular-nums text-muted-foreground">
                      {formatMoney(amount)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="q-tax">Tax rate (%)</Label>
              <Input id="q-tax" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" placeholder="20" />
            </div>
            <div>
              <Label htmlFor="q-discount">Discount</Label>
              <Input id="q-discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
            </div>
          </div>

          <div>
            <Label htmlFor="q-notes">Notes</Label>
            <Textarea id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for the client" />
          </div>

          {/* Totals preview */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatMoney(totals.subtotalCents)}</span>
            </div>
            {totals.discountCents > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">−{formatMoney(totals.discountCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatMoney(totals.taxCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totals.totalCents)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
