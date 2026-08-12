"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi, tasksApi, locationsApi, type SalesBoard, type DealTask, type WorkflowStatus } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, TrendingUp, Trophy, CircleDollarSign } from "lucide-react";
import { formatMoney, toCents } from "./_lib/format";

export default function PipelinePage() {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const boardQ = useQuery<SalesBoard>({ queryKey: ["crm-board"], queryFn: () => crmApi.getBoard() });

  const move = useMutation({
    mutationFn: ({ id, statusKey }: { id: string; statusKey: string }) => tasksApi.updateStatus(id, statusKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-board"] });
      qc.invalidateQueries({ queryKey: ["crm-forecast"] });
    },
    onError: (e: any) => notify.error(e.message || "Could not move deal"),
  });

  const board = boardQ.data;
  const statuses = useMemo(
    () => (board?.workflow.statuses ?? []).slice().sort((a, b) => a.position - b.position),
    [board],
  );
  const dealsByStatus = useMemo(() => {
    const map = new Map<string, DealTask[]>();
    for (const s of statuses) map.set(s.key, []);
    for (const t of board?.tasks ?? []) {
      if (!map.has(t.status)) map.set(t.status, []);
      map.get(t.status)!.push(t);
    }
    return map;
  }, [board, statuses]);

  const onDrop = (statusKey: string) => {
    if (draggingId) {
      const t = board?.tasks.find((d) => d.id === draggingId);
      if (t && t.status !== statusKey) move.mutate({ id: draggingId, statusKey });
    }
    setDraggingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <NewDealDialog workflowId={board?.workflow.id} statuses={statuses} />
      </div>

      <ForecastBar
        loading={boardQ.isLoading}
        openCents={board?.forecast.totalOpenCents ?? 0}
        weightedCents={board?.forecast.weightedCents ?? 0}
        wonCents={board?.forecast.wonCents ?? 0}
      />

      {boardQ.isLoading ? (
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />)}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statuses.map((status) => (
            <StatusColumn
              key={status.id}
              status={status}
              deals={dealsByStatus.get(status.key) ?? []}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDropDeal={() => onDrop(status.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ForecastBar({ loading, openCents, weightedCents, wonCents }: { loading: boolean; openCents: number; weightedCents: number; wonCents: number }) {
  const cards = [
    { label: "Open pipeline", value: openCents, icon: CircleDollarSign, tint: "text-blue-600" },
    { label: "Weighted forecast", value: weightedCents, icon: TrendingUp, tint: "text-amber-600" },
    { label: "Won", value: wonCents, icon: Trophy, tint: "text-green-600" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <c.icon className={cn("size-4", c.tint)} /> {c.label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {loading ? <Skeleton className="h-7 w-24" /> : formatMoney(c.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusColumn({ status, deals, draggingId, onDragStart, onDropDeal }: {
  status: WorkflowStatus;
  deals: DealTask[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDropDeal: () => void;
}) {
  const [over, setOver] = useState(false);
  const total = deals.reduce((s, d) => s + (d.amountCents ?? 0), 0);
  return (
    <div
      className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30", over ? "border-primary" : "border-border")}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDropDeal(); }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: status.color || "#6b7280" }} />
          <span className="text-sm font-medium">{status.name}</span>
          <span className="text-xs text-muted-foreground">{deals.length}</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(total)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {deals.map((d) => (
          <div
            key={d.id}
            draggable
            onDragStart={() => onDragStart(d.id)}
            onDragEnd={() => onDragStart("")}
            className={cn(
              "cursor-grab rounded-md border border-border bg-card p-3 shadow-sm active:cursor-grabbing",
              draggingId === d.id && "opacity-50",
            )}
          >
            <div className="text-sm font-medium leading-tight">{d.title}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-semibold tabular-nums">{formatMoney(d.amountCents, d.currency || "EUR")}</span>
              {d.space && <span className="max-w-[9rem] truncate text-xs text-muted-foreground">{d.space.name}</span>}
            </div>
          </div>
        ))}
        {deals.length === 0 && (
          <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Drop deals here
          </div>
        )}
      </div>
    </div>
  );
}

function NewDealDialog({ workflowId, statuses }: { workflowId?: string; statuses: WorkflowStatus[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [spaceId, setSpaceId] = useState<string>("");

  // Customer-company spaces = accounts a deal belongs to.
  const spacesQ = useQuery({
    queryKey: ["locations", "crm-customer-spaces"],
    queryFn: () => locationsApi.list({ kind: "CUSTOMER", limit: 100 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => tasksApi.create({
      title,
      workflowId,
      amountCents: toCents(amount),
      currency: "EUR",
      spaceId: spaceId || undefined,
      assignedToId: user?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-board"] });
      qc.invalidateQueries({ queryKey: ["crm-forecast"] });
      notify.success("Deal created");
      setOpen(false); setTitle(""); setAmount(""); setSpaceId("");
    },
    onError: (e: any) => notify.error(e.message || "Could not create deal"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 size-4" /> New deal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New deal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="deal-title">Title</Label>
            <Input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acme — annual contract" />
          </div>
          <div>
            <Label htmlFor="deal-amount">Amount (EUR)</Label>
            <Input id="deal-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" inputMode="decimal" />
          </div>
          <div>
            <Label>Customer account</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger><SelectValue placeholder="Unassigned (default space)" /></SelectTrigger>
              <SelectContent>
                {(((spacesQ.data as any)?.data ?? spacesQ.data ?? []) as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Deals live in a customer-company space. Create one under Spaces if the account isn&apos;t listed.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!title.trim() || !workflowId || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
