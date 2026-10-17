/** The rules: the reference, a signature fit to draw, the issuer choices, the client copy, the printed route. */
import { haversineDistance } from '../../utils/geofence';
import { CLIENT_SAFE_EVENTS, TASK_REPORT_SECTIONS, type ClientCopyOption, type TaskReportSection } from './sections';
import type { TaskReport, TaskReportEvent, TaskReportIssuerOption, TaskReportPerson, TaskReportRoute } from './types';

/** Hard ceiling on one report's history (read newest first, in pages). */
export const REPORT_HISTORY_MAX = 5000;

// ─── rules ──────────────────────────────────────────────────────────────────

/** The reference a portal request carries — the client portal and the report say the same. */
export function portalRequestReference(taskId: string): string {
  return `#${String(taskId).slice(-6).toUpperCase()}`;
}

/** A signature image is ~10–200 KB; anything near this is not a signature. */
const SIGNATURE_MAX_CHARS = 2_000_000;

const SIGNATURE_SHAPE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * A stored signature, as the report may pass it on — or null.
 *
 * ⚠️ The column is free text ("base64 encoded PNG or URL"). Only a PNG/JPEG data
 * URL is drawn: a URL would make the PDF fetch from wherever it points, an SVG
 * can carry script, and anything else is not a signature.
 */
export function safeSignatureDataUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > SIGNATURE_MAX_CHARS) return null;
  return SIGNATURE_SHAPE.test(v) ? v : null;
}

/**
 * The "Issued by" choices, built from WHITELISTED fields — whatever else the rows
 * carry (bank accounts, tax numbers) cannot reach the list. Main company first.
 */
export function reportIssuerOptions(
  entities: ReadonlyArray<{ id: string; legalName: string; label?: string | null; isMain?: boolean | null }>,
): TaskReportIssuerOption[] {
  return entities
    .map((e) => ({ id: e.id, name: (e.label && e.label.trim()) || e.legalName, isMain: !!e.isMain }))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name));
}

/** The sections present in a bundle, in print order. */
export function presentSections(r: Omit<TaskReport, 'meta'> & Partial<Pick<TaskReport, 'meta'>>): TaskReportSection[] {
  return TASK_REPORT_SECTIONS.filter((s) => (r as Record<string, unknown>)[s] !== undefined);
}

function pick(src: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** One history event as the client may read it — or null when it is internal. */
export function clientSafeEvent(e: TaskReportEvent): TaskReportEvent | null {
  const rule = CLIENT_SAFE_EVENTS[e.type];
  if (!rule) return null;
  const refs: Record<string, TaskReportPerson> = {};
  for (const k of rule.refs) if (e.refs[k]) refs[k] = e.refs[k]!;
  return { id: e.id, type: e.type, at: e.at, actor: e.actor, refs, data: pick(e.data, rule.data) };
}

/**
 * The client copy of an office report. See the file header: built from what it
 * KEEPS, so nothing new reaches a client by default.
 */
export function toClientCopy(r: TaskReport, include: readonly ClientCopyOption[] = []): TaskReport {
  const on = new Set(include);
  const out: TaskReport = {
    meta: { ...r.meta, copy: 'client', include: [...on] },
    header: r.header,
    request: r.request,
    history: on.has('fullHistory') ? r.history : r.history.map(clientSafeEvent).filter((e): e is TaskReportEvent => e !== null),
  };
  if (r.work !== undefined) out.work = r.work;
  if (r.time !== undefined) {
    out.time = { asOf: r.time.asOf, total: r.time.total };
    if (on.has('personTime') && r.time.byPerson) out.time.byPerson = r.time.byPerson;
    if (on.has('stopReasons') && r.time.ownStops) out.time.ownStops = r.time.ownStops;
  }
  if (r.photos !== undefined) out.photos = r.photos;
  if (r.checklist !== undefined) out.checklist = r.checklist;
  if (r.stepAnswers !== undefined) out.stepAnswers = r.stepAnswers;
  if (r.parts !== undefined) {
    out.parts = r.parts.map((p) =>
      on.has('partPrices')
        ? p
        : { id: p.id, name: p.name, partNumber: p.partNumber, quantity: p.quantity, notes: p.notes },
    );
  }
  // The route is filled by the gateway after this; keep its slot only when chosen.
  if (on.has('route') && r.route !== undefined) out.route = r.route;
  if (on.has('comments') && r.comments !== undefined) out.comments = r.comments;
  if (on.has('handovers') && r.handovers !== undefined) out.handovers = r.handovers;
  if (r.documents !== undefined) out.documents = r.documents;
  if (r.details !== undefined) out.details = r.details;
  if (r.signatures !== undefined) out.signatures = r.signatures;
  out.meta.sections = presentSections(out);
  return out;
}

/** What tracking-service answers for a task's route (`get_task_route`). */
export interface TrackedTaskRoute {
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  duration?: number | null;
  distance?: number | null;
  points?: Array<{ lat: number; lng: number; timestamp: string | Date }> | null;
  matchedPath?: unknown;
}

/**
 * The tracked route as the report prints it. `arrivalDistanceMeters` is how
 * far the LAST recorded point was from the job's pin — what "arrived" looked
 * like on the map; null when either end is unknown.
 */
export function toReportRoute(raw: TrackedTaskRoute, site: { lat: number | null; lng: number | null }): TaskReportRoute {
  const points = (raw.points ?? [])
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map((p) => ({ lat: p.lat, lng: p.lng, timestamp: new Date(p.timestamp).toISOString() }));
  const last = points[points.length - 1];
  const when = (d: string | Date | null | undefined) => (d == null ? null : new Date(d).toISOString());
  return {
    distanceMeters: typeof raw.distance === 'number' ? raw.distance : null,
    startedAt: when(raw.startTime),
    endedAt: when(raw.endTime),
    durationSeconds: typeof raw.duration === 'number' ? raw.duration : null,
    pointCount: points.length,
    points,
    matchedPath: raw.matchedPath ?? null,
    arrivalDistanceMeters:
      last && site.lat != null && site.lng != null ? Math.round(haversineDistance(last.lat, last.lng, site.lat, site.lng)) : null,
  };
}
