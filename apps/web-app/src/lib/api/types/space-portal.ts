

// ── Per-space B2C portal (config + unit/apartment catalog) ──
export interface SpacePortalConfig { id: string; templateKey: string; entityLabel: string; name: string }


export interface PortalSummary {
  id: string;
  organizationId: string;
  name: string;
  templateKey: string;
  entityLabel: string;
  contactLabel?: string | null;
  accent?: string | null;
  isActive: boolean;
  residentCount: number;
  categoryCount: number;
}
