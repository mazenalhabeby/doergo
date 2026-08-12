// ═══════════════════════════════════════════════════════════════════════════
//  Sales / CRM shared types (merged into the Space + Task core)
//
//  A DEAL is a Task (of the "Deal" task type) — so there is no Deal/Pipeline/Lead
//  type here; use the Task + StatusWorkflow types. The only sales-specific shapes
//  are CONTACTS (many people per customer space), COMMISSIONS (booked on a won
//  deal-task), and the stateless ROUTE optimizer. Money is integer cents.
// ═══════════════════════════════════════════════════════════════════════════

import type { CommissionBasis, CommissionEntryStatus } from './enums';

export interface Contact {
  id: string;
  organizationId: string;
  spaceId?: string | null;
  firstName: string;
  lastName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
  ownerId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  space?: { id: string; name: string } | null;
  owner?: PersonRef | null;
}

export interface CommissionRule {
  id: string;
  organizationId: string;
  name: string;
  percent: number;
  basis: CommissionBasis;
  userId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionEntry {
  id: string;
  organizationId: string;
  ownerId: string;
  ruleId?: string | null;
  dealId?: string | null; // the won deal-Task id
  invoiceId?: string | null;
  baseCents: number;
  percent: number;
  amountCents: number;
  period: string; // YYYY-MM
  status: CommissionEntryStatus;
  createdAt: string;
  updatedAt: string;
  owner?: PersonRef | null;
}

export interface PersonRef {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
}

// A deal = a Task; the pipeline "board" is deal-type tasks grouped by their
// workflow status. This weighted-forecast shape is computed from those tasks
// (Σ amountCents × status.probability) — see the sales board on web.
export interface SalesForecast {
  workflowId: string;
  totalOpenCents: number;
  weightedCents: number;
  wonCents: number;
  byStatus: { statusKey: string; statusName: string; count: number; amountCents: number }[];
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE PLANNING / OPTIMIZATION
//  A "stop" is a geocoded visit — a Task with a location (or an ad-hoc address).
//  The optimizer orders them for the shortest driving trip and returns per-leg
//  ETAs; the client hands the ordered stops to Google Maps / Waze / Apple Maps.
// ═══════════════════════════════════════════════════════════════════════════

export interface RouteStop {
  id: string; // caller's id (taskId / free) — echoed back in order
  lat: number;
  lng: number;
  label?: string;
  address?: string;
}

export interface RouteOptimizeRequest {
  start: { lat: number; lng: number; label?: string };
  stops: RouteStop[];
  end?: { lat: number; lng: number; label?: string };
  profile?: 'driving';
  roundTrip?: boolean;
}

export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  meters: number;
  seconds: number;
}

export interface OptimizedRoute {
  order: string[];
  waypoints: { lat: number; lng: number; label?: string; stopId?: string }[];
  legs: RouteLeg[];
  totalMeters: number;
  totalSeconds: number;
  geometry?: unknown;
  engine: 'osrm' | 'nearest-neighbour';
}
