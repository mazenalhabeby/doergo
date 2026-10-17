

export interface Colleague {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
  role?: string;
  spaceName?: string | null;
  /** AVAILABLE | BUSY | AWAY, or null (from activity). Live through `presence.changed`. */
  presence?: "AVAILABLE" | "BUSY" | "AWAY" | null
  /** May the caller message them — chat's own rule, added by the gateway. */
  canMessage?: boolean
}
