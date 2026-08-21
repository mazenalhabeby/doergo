import i18n from "@/i18n"
import type { OrgMember } from "@/lib/api"
import type { PersonNodeProps, WorkerStatus } from "@/components/dashboard"

import { getAvatarColor, getInitials } from "../_components/helpers"

/**
 * Presence classification: turning a member plus their attendance facts into
 * the status dot and label a dashboard card shows.
 *
 * Extracted from the dashboard page so the rules can be read and tested on
 * their own — they encode a genuinely subtle policy (availability outranks the
 * clock, the clock outranks nothing but offline) that was previously buried in
 * a 1100-line component.
 */

/** App-active within this window → the green "online" ring. */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000

/**
 * Worker status shown on the dashboard. Availability (Available/Busy/Away — the
 * status the user sets, defaulting to Available) is the primary signal; clock-in
 * is a SEPARATE concept and only adds context ("On Break"/"Late") when on the
 * clock. Not being clocked in no longer means "Offline" — the green "online"
 * ring (app-active) conveys online/offline independently.
 */
export function getEmployeeStatus(opts: {
  isClockedIn: boolean
  isOnBreak: boolean
  isOnline: boolean // app-active within the last few minutes
  presence?: string | null // availability status (defaults to Available)
  isRemote?: boolean // clocked in via remote / WFH
  isShiftBased?: boolean // their space is shift-based (SHIFT/FIXED) → "On Shift" applies
  atSpace?: boolean // clocked in INSIDE a geofenced space → confirmed at the space
  /**
   * The reminder engine escalated this open session and gave up on it — it
   * nudged to its limit, got no answer, told a leader, and stopped.
   */
  needsReview?: boolean
}): { status: WorkerStatus; tag?: PersonNodeProps["tag"] } {
  // Genuinely offline: not app-active AND not on the clock. Their stored
  // availability doesn't apply because they aren't currently reachable.
  if (!opts.isOnline && !opts.isClockedIn) {
    return { status: "off" }
  }
  // Attendance exceptions first (only while on the clock).
  if (opts.isClockedIn && opts.isOnBreak) {
    return { status: "on", tag: { text: i18n.t("dashboard.presence.onBreak"), variant: "hrs" } }
  }
  // Availability the user DELIBERATELY set overrides the default clock label.
  if (opts.presence === "BUSY") {
    return { status: "busy", tag: { text: i18n.t("dashboard.presence.busy"), variant: "task" } }
  }
  if (opts.presence === "AWAY") {
    return { status: "away", tag: { text: i18n.t("dashboard.presence.away"), variant: "hrs" } }
  }
  // On the clock → label by WHERE they are relative to the space (not their access
  // type). Remote is its own thing; then shift-based spaces split into On Shift
  // (confirmed inside the geofence) vs In Field (no location / outside it); an
  // office / open-hours space (non shift-based) is simply "Working".
  if (opts.isClockedIn) {
    /*
      An escalated session is reported as what it is, before anything else.

      Someone who forgot to clock out yesterday is, to the database, still
      clocked in — and every label below would describe them confidently as
      Remote, On Shift or Working. Those read as "here, now", which is exactly
      what an abandoned session is not. The server already knows the difference
      (it escalated this one to a human and stopped chasing it); it simply never
      said so on screen, so the two states arrived looking identical.
    */
    if (opts.needsReview) {
      return { status: "on", tag: { text: i18n.t("dashboard.presence.needsReview"), variant: "hrs-warn" } }
    }
    if (opts.isRemote) return { status: "on", tag: { text: i18n.t("dashboard.presence.remote"), variant: "task" } }
    if (!opts.isShiftBased) return { status: "on", tag: { text: i18n.t("dashboard.presence.working", "Working"), variant: "hrs" } }
    if (opts.atSpace) return { status: "on", tag: { text: i18n.t("dashboard.presence.onShift"), variant: "hrs" } }
    return { status: "on", tag: { text: i18n.t("dashboard.presence.inField"), variant: "task" } }
  }
  // Logged in / online but not clocked in.
  return { status: "on", tag: { text: i18n.t("dashboard.presence.available"), variant: "hrs" } }
}

/** App-active within ONLINE_WINDOW_MS → show the green "online" ring. */
export function isOnline(lastActiveAt?: string | null): boolean {
  return !!lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_MS
}

/** Build a PersonNodeProps from an OrgMember. `clockedIn` drives the green ring. */
export function memberToPersonNode(
  member: OrgMember,
  status: WorkerStatus,
  tag?: PersonNodeProps["tag"],
  currentTask?: string,
  clockedIn = false,
  /**
   * Only set when this member's displayed name is shared with someone else on
   * the dashboard — see `disambiguatorFor` in build-workspace-boxes.
   */
  subtitle?: string,
): PersonNodeProps {
  return {
    initials: getInitials(member.firstName, member.lastName),
    color: getAvatarColor(member.id),
    status,
    clockedIn,
    imageUrl: member.avatarUrl || undefined,
    // "Ada L." — but a member with no surname must not render as "Ada .".
    name: member.lastName?.[0] ? `${member.firstName} ${member.lastName[0]}.` : member.firstName,
    tag,
    userId: member.id,
    role: member.role === "EMPLOYEE" ? "Employee" : "Admin",
    currentTask,
    subtitle,
  }
}
