"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { crmApi, routesApi } from "@/lib/api";
import type { OptimizedRoute, RouteStop } from "@hbcfield/shared/client";
import {
  buildGoogleMapsUrl, buildNavUrl, supportsMultiStop, type NavApp,
} from "@hbcfield/shared/client";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MapPin, Navigation, Crosshair, Search, Wand2, Loader2, X } from "lucide-react";
import { formatKm, formatDuration } from "../_lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

type Stop = RouteStop;
type LatLng = { lat: number; lng: number; label?: string };

export default function RoutePlannerPage() {
  const [start, setStart] = useState<LatLng | null>(null);
  const [selected, setSelected] = useState<Record<string, Stop>>({});
  const [manualStops, setManualStops] = useState<Stop[]>([]);
  const [roundTrip, setRoundTrip] = useState(false);
  const [navApp, setNavApp] = useState<NavApp>("google");
  const [result, setResult] = useState<OptimizedRoute | null>(null);
  const [locating, setLocating] = useState(false);

  // Candidate stops = leads that have coordinates.
  const leadsQ = useQuery({
    queryKey: ["crm-leads", "route"],
    queryFn: () => crmApi.listLeads({ limit: 100 }),
  });
  const leadStops: Stop[] = useMemo(
    () => (leadsQ.data?.items ?? [])
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({ id: `lead:${l.id}`, lat: l.lat as number, lng: l.lng as number, label: l.company || l.name, address: l.address ?? undefined })),
    [leadsQ.data],
  );

  const allStops = useMemo(() => [...leadStops, ...manualStops], [leadStops, manualStops]);
  const chosen = useMemo(() => allStops.filter((s) => selected[s.id]), [allStops, selected]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { notify.error("Geolocation is not available"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "My location" }); setLocating(false); },
      () => { notify.error("Could not get your location — allow location access"); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const optimize = useMutation({
    mutationFn: () => {
      const from = start ?? (chosen[0] ? { lat: chosen[0].lat, lng: chosen[0].lng, label: chosen[0].label } : null);
      if (!from) throw new Error("Set a start point (use your location)");
      const stops = start ? chosen : chosen.slice(1); // if no explicit start, first chosen becomes the start
      if (stops.length === 0) throw new Error("Pick at least one stop");
      return routesApi.optimize({ start: from, stops, roundTrip });
    },
    onSuccess: (r) => { setResult(r); notify.success(`Optimized ${r.order.length} stops`); },
    onError: (e: any) => notify.error(e.message || "Could not optimize route"),
  });

  const orderedStops: Stop[] = useMemo(() => {
    if (!result) return [];
    const byId = new Map(allStops.map((s) => [s.id, s]));
    return result.order.map((id) => byId.get(id)).filter(Boolean) as Stop[];
  }, [result, allStops]);

  const openFullRoute = () => {
    if (!result || !start) return;
    const url = buildGoogleMapsUrl(start, orderedStops, roundTrip ? start : undefined);
    if (url) window.open(url, "_blank");
  };

  const navTo = (stop: Stop, index: number) => {
    if (!start) return;
    const url = buildNavUrl(navApp, { start, orderedStops, nextStop: stop, end: roundTrip ? start : undefined });
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* Left: build the plan */}
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Start</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
              {locating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Crosshair className="mr-1.5 size-4" />}
              Use my location
            </Button>
            {start && <span className="truncate text-sm text-muted-foreground">{start.label} ({start.lat.toFixed(3)}, {start.lng.toFixed(3)})</span>}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <Checkbox checked={roundTrip} onCheckedChange={(v) => setRoundTrip(!!v)} /> Return to start (round trip)
          </label>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Stops</h2>
            <span className="text-xs text-muted-foreground">{chosen.length} selected</span>
          </div>
          <AddressSearch onPick={(s) => { setManualStops((prev) => [...prev, s]); setSelected((p) => ({ ...p, [s.id]: s })); }} />
          <div className="mt-3 max-h-[22rem] space-y-1 overflow-y-auto">
            {allStops.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No stops yet. Search an address above, or add coordinates to your leads.
              </p>
            )}
            {allStops.map((s) => (
              <label key={s.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50">
                <Checkbox className="mt-0.5" checked={!!selected[s.id]} onCheckedChange={(v) => setSelected((p) => ({ ...p, [s.id]: v ? s : undefined as any }))} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.label || s.id}</span>
                  {s.address && <span className="block truncate text-xs text-muted-foreground">{s.address}</span>}
                </span>
                {s.id.startsWith("manual:") && (
                  <button onClick={() => { setManualStops((prev) => prev.filter((m) => m.id !== s.id)); setSelected((p) => { const n = { ...p }; delete n[s.id]; return n; }); }}
                    className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                )}
              </label>
            ))}
          </div>
        </section>

        <Button className="w-full" onClick={() => optimize.mutate()} disabled={optimize.isPending || chosen.length === 0}>
          {optimize.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Wand2 className="mr-1.5 size-4" />}
          Optimize route
        </Button>
      </div>

      {/* Right: the optimized plan */}
      <div className="space-y-4">
        {!result ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            <Navigation className="mb-3 size-8" />
            <p className="text-sm">Pick your stops and hit <strong>Optimize route</strong>.</p>
            <p className="mt-1 text-xs">We compute the shortest driving order, then you drive it in Google Maps, Waze or Apple Maps with live traffic.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex gap-6">
                <div>
                  <div className="text-xs text-muted-foreground">Distance</div>
                  <div className="text-lg font-semibold tabular-nums">{formatKm(result.totalMeters)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Drive time</div>
                  <div className="text-lg font-semibold tabular-nums">{formatDuration(result.totalSeconds)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Stops</div>
                  <div className="text-lg font-semibold tabular-nums">{result.order.length}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={navApp} onValueChange={(v) => setNavApp(v as NavApp)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Maps</SelectItem>
                    <SelectItem value="waze">Waze</SelectItem>
                    <SelectItem value="apple">Apple Maps</SelectItem>
                  </SelectContent>
                </Select>
                {supportsMultiStop(navApp) ? (
                  <Button size="sm" onClick={openFullRoute}><Navigation className="mr-1.5 size-4" /> Open full route</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Stop-by-stop →</span>
                )}
              </div>
            </div>
            {result.engine === "nearest-neighbour" && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Route engine unavailable — showing a good-enough nearest-first order.
              </p>
            )}

            <ol className="space-y-2">
              <li className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">A</span>
                <span className="text-sm font-medium">{start?.label || "Start"}</span>
              </li>
              {orderedStops.map((s, i) => {
                const leg = result.legs[i];
                return (
                  <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.label || s.id}</span>
                      {leg && <span className="text-xs text-muted-foreground">{formatKm(leg.meters)} · {formatDuration(leg.seconds)} from previous</span>}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => navTo(s, i)}>
                      <Navigation className="mr-1.5 size-3.5" /> Navigate
                    </Button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

// Lightweight address search using the /geo proxy (Google Places + Photon).
function AddressSearch({ onPick }: { onPick: (stop: Stop) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string; lat?: number; lon?: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const session = useMemo(() => Math.random().toString(36).slice(2), []);

  const search = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/geo/search?q=${encodeURIComponent(q)}&session=${session}&limit=6`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data?.results ?? []);
    } catch { notify.error("Address search failed"); } finally { setBusy(false); }
  };

  const pick = async (r: { id: string; label: string; lat?: number; lon?: number }) => {
    let lat = r.lat, lng = r.lon;
    if ((lat == null || lng == null) && r.id) {
      try {
        const res = await fetch(`${API_BASE}/geo/place?id=${encodeURIComponent(r.id)}&session=${session}`);
        const p = await res.json();
        lat = p?.lat; lng = p?.lon;
      } catch { /* ignore */ }
    }
    if (lat == null || lng == null) { notify.error("Could not resolve that address"); return; }
    onPick({ id: `manual:${r.id || `${lat},${lng}`}`, lat, lng, label: r.label, address: r.label });
    setQ(""); setResults([]);
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search an address…" />
        <Button variant="outline" size="icon" onClick={search} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </div>
      {results.length > 0 && (
        <div className="mt-1 rounded-md border border-border">
          {results.map((r, i) => (
            <button key={i} onClick={() => pick(r)} className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted/50">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
