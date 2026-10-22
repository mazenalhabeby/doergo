import type { AccessDraft } from "@hbcfield/shared/client"

/** What AccessFields takes; its sections pick the values they read. */
export interface AccessFieldsProps {
  value: AccessDraft
  /** Emit a partial patch; the parent owns the draft. */
  onChange: (patch: Partial<AccessDraft>) => void
  /** Member id to hide from the "Specific contacts" picker (omit when inviting). */
  excludeContactId?: string
  /** Show the Role selector (member edit + invite). */
  showRole?: boolean
  /** Lock the Role selector (editing your own row — can't change your own role). */
  lockRole?: boolean
  /** Render ONLY the role selector — for an admin, whose permissions are fixed. */
  roleOnly?: boolean
  /** Offer the Admin option (member edit). Invites can't create admins → false. */
  allowAdmin?: boolean
  /**
   * This person works for a client or partner. Shows only what shapes their
   * SCREENS — where they log in, and which tabs they get.
   *
   * The four sections dropped are not hidden for tidiness, they are sections
   * that cannot mean anything here: the org Role is refused by the server, the
   * Permissions readout is derived from that role and so reads "grants no
   * permissions yet" for everybody external, remote clock-in belongs to
   * somebody who clocks in, and space visibility is settled by their single
   * assignment. A control that cannot take effect is worse than an absent one
   * — somebody sets it and waits for something to happen.
   *
   * Their actual powers come from the role they are given IN a space.
   */
  external?: boolean
}
