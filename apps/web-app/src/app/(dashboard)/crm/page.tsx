"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi, type DealBoard } from "@/lib/api";
import type { Deal, PipelineStage } from "@hbcfield/shared/client";
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
  const [pipelineId, setPipelineId] = useState<string | undefined>(undefined);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pipelinesQ = useQuery({ queryKey: ["crm-pipelines"], queryFn: () => crmApi.listPipelines() });
  const boardQ = useQuery<DealBoard>({
    queryKey: ["crm-board", pipelineId ?? "default"],
    queryFn: () => crmApi.getBoard(pipelineId),
  });
  const forecastQ = useQuery({
    queryKey: ["crm-forecast", pipelineId ?? "default"],
    queryFn: () => crmApi.getForecast(pipelineId),
  });

  const move = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => crmApi.moveDeal(id, stageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-board"] });
      qc.invalidateQueries({ queryKey: ["crm-forecast"] });
    },
    onError: (e: any) => notify.error(e.message || "Could not move deal"),
  });

  const board = boardQ.data;
  const stages = board?.stages ?? [];
  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const s of stages) map.set(s.id, []);
    for (const d of board?.deals ?? []) {
      if (!map.has(d.stageId)) map.set(d.stageId, []);
      map.get(d.stageId)!.push(d);
    }
    return map;
  }, [board]);

  const onDrop = (stageId: string) => {
    if (draggingId) {
      const deal = board?.deals.find((d) => d.id === draggingId);
      if (deal && deal.stageId !== stageId) move.mutate({ id: draggingId, stageId });
    }
    setDraggingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header: pipeline selector + forecast + new deal */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {pipelinesQ.data && pipelinesQ.data.length > 1 && (
            <Select value={pipelineId ?? pipelinesQ.data[0]?.id} onValueChange={setPipelineId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                {pipelinesQ.data.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <NewDealDialog stages={stages} pipelineId={board?.pipelineId} />
      </div>

      <ForecastBar
        loading={forecastQ.isLoading}
        openCents={forecastQ.data?.totalOpenCents ?? 0}
        weightedCents={forecastQ.data?.weightedCents ?? 0}
        wonCents={forecastQ.data?.wonCents ?? 0}
      />

      {/* Board */}
      {boardQ.isLoading ? (
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />)}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage.get(stage.id) ?? []}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDropDeal={() => onDrop(stage.id)}
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

function StageColumn({ stage, deals, draggingId, onDragStart, onDropDeal }: {
  stage: PipelineStage;
  deals: Deal[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDropDeal: () => void;
}) {
  const [over, setOver] = useState(false);
  const total = deals.reduce((s, d) => s + d.amountCents, 0);
  return (
    <div
      className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30", over ? "border-primary" : "border-border")}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDropDeal(); }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: stage.color || "#6b7280" }} />
          <span className="text-sm font-medium">{stage.name}</span>
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
              <span className="text-sm font-semibold tabular-nums">{formatMoney(d.amountCents, d.currency)}</span>
              {d.contact && (
                <span className="max-w-[9rem] truncate text-xs text-muted-foreground">
                  {d.contact.firstName} {d.contact.lastName ?? ""}
                </span>
              )}
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

function NewDealDialog({ stages, pipelineId }: { stages: PipelineStage[]; pipelineId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [stageId, setStageId] = useState<string>("");

  const create = useMutation({
    mutationFn: () => crmApi.createDeal({
      title,
      amountCents: toCents(amount),
      pipelineId,
      stageId: stageId || stages[0]?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-board"] });
      qc.invalidateQueries({ queryKey: ["crm-forecast"] });
      notify.success("Deal created");
      setOpen(false); setTitle(""); setAmount(""); setStageId("");
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
            <Label htmlFor="deal-amount">Amount</Label>
            <Input id="deal-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" inputMode="decimal" />
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={stageId || stages[0]?.id} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
