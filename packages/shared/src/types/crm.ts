// ═══════════════════════════════════════════════════════════════════════════
//  Sales / CRM shared types
//  Client-facing shapes for contacts, leads, pipelines, deals, activities,
//  quotes and commissions. Money is integer minor units (cents) everywhere.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  LeadStatus,
  SalesActivityType,
  QuoteStatus,
  CommissionBasis,
  CommissionEntryStatus,
} from './enums';

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
  // Populated
  space?: { id: string; name: string } | null;
  owner?: PersonRef | null;
}

export interface Lead {
  id: string;
  organizationId: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status: LeadStatus;
  ownerId?: string | null;
  notes?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  convertedSpaceId?: string | null;
  convertedContactId?: string | null;
  convertedDealId?: string | null;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: PersonRef | null;
}

export interface Pipeline {
  id: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  stages?: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  organizationId: string;
  pipelineId: string;
  name: string;
  position: number;
  probability: number; // 0-100
  isWon: boolean;
  isLost: boolean;
  color?: string | null;
}

export interface Deal {
  id: string;
  organizationId: string;
  title: string;
  spaceId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  ownerId?: string | null;
  pipelineId: string;
  stageId: string;
  amountCents: number;
  currency: string;
  expectedCloseAt?: string | null;
  closedAt?: string | null;
  isWon: boolean;
  isLost: boolean;
  wonReason?: string | null;
  lostReason?: string | null;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated
  stage?: PipelineStage | null;
  contact?: Contact | null;
  space?: { id: string; name: string } | null;
  owner?: PersonRef | null;
}

export interface SalesActivity {
  id: string;
  organizationId: string;
  type: SalesActivityType;
  ownerId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  spaceId?: string | null;
  taskId?: string | null;
  subject?: string | null;
  body?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: PersonRef | null;
}

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  taskId?: string | null;
}

export interface Quote {
  id: string;
  organizationId: string;
  quoteNumber: string;
  status: QuoteStatus;
  dealId?: string | null;
  spaceId?: string | null;
  contactId?: string | null;
  clientName: string;
  clientEmail?: string | null;
  clientAddress?: string | null;
  lineItems: QuoteLineItem[];
  subtotalCents: number;
  taxRate?: number | null;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  validUntil?: string | null;
  sentAt?: string | null;
  acceptedAt?: string | null;
  notes?: string | null;
  invoiceId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
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
  dealId?: string | null;
  quoteId?: string | null;
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

// ─── Weighted forecast ───────────────────────────────────────────────────────

export interface PipelineForecast {
  pipelineId: string;
  totalOpenCents: number;
  weightedCents: number; // Σ amount × stage.probability
  wonCents: number;
  byStage: { stageId: string; stageName: string; count: number; amountCents: number }[];
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE PLANNING / OPTIMIZATION
//  A "stop" is a geocoded address (a visit task, a lead, or an account). The
//  optimizer orders them for the shortest driving trip and returns per-leg ETAs;
//  the client then hands the ordered stops to Google Maps / Waze / Apple Maps.
// ═══════════════════════════════════════════════════════════════════════════

export interface RouteStop {
  id: string; // caller's id (taskId / leadId / dealId / free) — echoed back in order
  lat: number;
  lng: number;
  label?: string;
  address?: string;
}

export interface RouteOptimizeRequest {
  // Where the day starts (rep's current GPS or a chosen home base).
  start: { lat: number; lng: number; label?: string };
  stops: RouteStop[];
  // Optional return-to-base at the end of the day.
  end?: { lat: number; lng: number; label?: string };
  // 'driving' (default). Kept open for future 'walking'/'cycling'.
  profile?: 'driving';
  // Round trip back to `start` when no explicit `end` is given.
  roundTrip?: boolean;
}

export interface RouteLeg {
  fromIndex: number; // index into the ordered waypoint list
  toIndex: number;
  meters: number;
  seconds: number;
}

export interface OptimizedRoute {
  // The stop ids in optimal visit order (start/end excluded).
  order: string[];
  // Full ordered waypoint list incl. start (and end if given), each with its stop.
  waypoints: { lat: number; lng: number; label?: string; stopId?: string }[];
  legs: RouteLeg[];
  totalMeters: number;
  totalSeconds: number;
  // Encoded polyline (or GeoJSON) of the whole trip for map rendering.
  geometry?: unknown;
  // 'osrm' when optimized by the trip engine, 'nearest-neighbour' on fallback.
  engine: 'osrm' | 'nearest-neighbour';
}
