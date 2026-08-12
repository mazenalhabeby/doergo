"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/lib/api";
import {
  type CommissionRule,
  type CommissionEntry,
  CommissionBasis,
  CommissionEntryStatus,
} from "@hbcfield/shared/client";
import { notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, MoreHorizontal } from "lucide-react";
import { formatMoney } from "../_lib/format";

const BASIS_LABELS: Record<string, string> = {
  [CommissionBasis.BOOKED]: "On deal won",
  [CommissionBasis.PAID]: "On invoice paid",
};

function basisLabel(basis: string): string {
  return BASIS_LABELS[basis] ?? basis;
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case CommissionEntryStatus.PAID:
      return "default";
    case CommissionEntryStatus.APPROVED:
      return "secondary";
    case CommissionEntryStatus.CANCELED:
      return "destructive";
    default:
      return "outline";
  }
}

export default function CommissionsPage() {
  return (
    <div className="space-y-10">
      <CommissionRulesSection />
      <CommissionEntriesSection />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

function CommissionRulesSection() {
  const qc = useQueryClient();
  const rulesQ = useQuery({
    queryKey: ["crm-commission-rules"],
    queryFn: () => crmApi.listCommissionRules(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => crmApi.deleteCommissionRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-commission-rules"] });
      notify.success("Rule deleted");
    },
    onError: (e: any) => notify.error(e.message || "Could not delete rule"),
  });

  const rules = rulesQ.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Commission rules</h2>
          <p className="text-sm text-muted-foreground">
            Define how commission is earned by your sales reps.
          </p>
        </div>
        <RuleDialog mode="create" />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Percent</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rulesQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No commission rules yet. Create one to start rewarding your reps.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell className="tabular-nums">{rule.percent}%</TableCell>
                  <TableCell>
                    <Badge variant="outline">{basisLabel(rule.basis)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.isActive ? "default" : "secondary"}>
                      {rule.isActive ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <RuleDialog
                          mode="edit"
                          rule={rule}
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              Edit
                            </DropdownMenuItem>
                          }
                        />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => {
                            if (window.confirm(`Delete rule "${rule.name}"?`)) {
                              remove.mutate(rule.id);
                            }
                          }}
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
    </section>
  );
}

function RuleDialog({
  mode,
  rule,
  trigger,
}: {
  mode: "create" | "edit";
  rule?: CommissionRule;
  trigger?: ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(rule?.name ?? "");
  const [percent, setPercent] = useState(rule ? String(rule.percent) : "");
  const [basis, setBasis] = useState<string>(rule?.basis ?? CommissionBasis.BOOKED);
  const [isActive, setIsActive] = useState<boolean>(rule?.isActive ?? true);

  const reset = () => {
    setName(rule?.name ?? "");
    setPercent(rule ? String(rule.percent) : "");
    setBasis(rule?.basis ?? CommissionBasis.BOOKED);
    setIsActive(rule?.isActive ?? true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<CommissionRule> = {
        name: name.trim(),
        percent: Number(percent) || 0,
        basis: basis as CommissionBasis,
        isActive,
      };
      return mode === "edit" && rule
        ? crmApi.updateCommissionRule(rule.id, payload)
        : crmApi.createCommissionRule(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-commission-rules"] });
      notify.success(mode === "edit" ? "Rule updated" : "Rule created");
      setOpen(false);
    },
    onError: (e: any) => notify.error(e.message || "Could not save rule"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="mr-1.5 size-4" /> New rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard sales commission"
            />
          </div>
          <div>
            <Label htmlFor="rule-percent">Percent (%)</Label>
            <Input
              id="rule-percent"
              type="number"
              inputMode="decimal"
              min={0}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="5"
            />
          </div>
          <div>
            <Label>Basis</Label>
            <Select value={basis} onValueChange={setBasis}>
              <SelectTrigger><SelectValue placeholder="Basis" /></SelectTrigger>
              <SelectContent>
                {Object.values(CommissionBasis).map((b) => (
                  <SelectItem key={b} value={b}>{basisLabel(b)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label className="cursor-pointer">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive rules stop generating new commission lines.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

function CommissionEntriesSection() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState<string>("ALL");

  const entriesQ = useQuery({
    queryKey: ["crm-commission-entries", period, status],
    queryFn: () =>
      crmApi.listCommissionEntries({
        period: period.trim() || undefined,
        status: status === "ALL" ? undefined : status,
      }),
  });

  const setStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      crmApi.setCommissionEntryStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-commission-entries"] });
      notify.success("Commission updated");
    },
    onError: (e: any) => notify.error(e.message || "Could not update commission"),
  });

  const entries = entriesQ.data ?? [];
  const total = useMemo(
    () => entries.reduce((sum, e) => sum + (e.amountCents || 0), 0),
    [entries],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Commission entries</h2>
          <p className="text-sm text-muted-foreground">
            Commission lines are created automatically when a deal is won.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="entries-period" className="text-xs">Period</Label>
            <Input
              id="entries-period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-40"
              placeholder="2026-08"
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {Object.values(CommissionEntryStatus).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Rep</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Percent</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entriesQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No commission lines here. Commission lines are created automatically when a deal is won.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="tabular-nums">{entry.period}</TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground"
                      title={entry.ownerId}
                    >
                      {entry.ownerId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(entry.baseCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.percent}%</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(entry.amountCents)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(entry.status)}>{entry.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() =>
                              setStatusMut.mutate({ id: entry.id, status: CommissionEntryStatus.APPROVED })
                            }
                          >
                            Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              setStatusMut.mutate({ id: entry.id, status: CommissionEntryStatus.PAID })
                            }
                          >
                            Mark paid
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() =>
                              setStatusMut.mutate({ id: entry.id, status: CommissionEntryStatus.CANCELED })
                            }
                          >
                            Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell colSpan={4} className="text-right text-sm font-medium text-muted-foreground">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(total)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
