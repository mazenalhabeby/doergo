

// ─────────────────────────────────────────────────────────────────────────────
// Customers — first-class entity for customer-scoped work + reporting.
// ─────────────────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  isPortalResident?: boolean;
  portalId?: string | null;
  // App-access status (only on the single-customer GET). invited = access granted;
  // accepted = signed up & has a login; entityLabel = the portal's entity.
  app?: { invited: boolean; accepted: boolean; active: boolean; portalName?: string | null; entityLabel?: string | null };
  spaceId?: string | null; // per-space CRM
  ownerId?: string | null; // sales owner
  managerIds?: string[]; // assigned sales managers
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  /** The language email to this client is written in (en|de|es|fr|it); null = same as the organization. */
  locale?: string | null;
  /** Invoice currency outside a workspace; null = the organization's. */
  currency?: string | null;
  /** The company that invoices this client outside a workspace; null = the main one. */
  legalEntityId?: string | null;
  details?: CustomerDetail[] | null;
  /**
   * The caller's CRM abilities ON THIS RECORD, resolved server-side and returned
   * by the single-customer GET. The UI hides what it may not do; the server
   * enforces every one of them regardless.
   */
  crmCaps?: { view: "none" | "own" | "all"; work: boolean; editInfo: boolean; manage: boolean; canAccess: boolean };
  /** This person exists as somebody's contact — not a client, and not billed as one. */
  isContact?: boolean;
  /** On a COMPANY row: how many contact people it has. */
  contactCount?: number;
  /** On a COMPANY row: who to ring — the primary contact, or the first added. */
  primaryContact?: { id: string; name: string; role?: string | null } | null;
  /** On a PERSON row: the company they contact, primary first. */
  contactOf?: { id: string; name: string; role?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}


/** A person who works at a company — see CustomerContact. */
export interface CustomerContactLink {
  id: string;
  role?: string | null;
  isPrimary: boolean;
  person: { id: string; name: string; email?: string | null; phone?: string | null; isContact?: boolean };
}


/** The mirror, read from the person's record. */
export interface CustomerCompanyLink {
  id: string;
  role?: string | null;
  isPrimary: boolean;
  company: { id: string; name: string; industry?: string | null };
}


export interface CustomerDetail { label: string; value: string }


export type CustomerInput = Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>;


export interface CustomerAddress {
  id: string;
  customerId?: string | null;
  name: string;
  label?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  isPrimary: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
}


export interface CustomerActivity {
  id: string;
  customerId: string;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "REMINDER" | "STATUS" | "SYSTEM";
  body?: string | null;
  authorId?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  reminderKind?: string | null; // CALL | EMAIL | MEETING | OTHER
  remindBeforeMin?: number | null;
  notifyAt?: string | null;
  reminderAssigneeId?: string | null;
  repeat?: string | null; // NONE | DAILY | WEEKLY | MONTHLY
  metadata?: { from?: string; to?: string } | null;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string | null } | null;
}
