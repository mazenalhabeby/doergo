"use client"

import { createContext, useContext, type ReactNode } from "react"
import { authApi } from "@/lib/api"
import { type SessionEndReason } from "@/lib/auth-session"

/**
 * The signed-in user's shape, how a session answer becomes one, the context object
 * AuthProvider fills and the hook that reads it — moved here unchanged from auth-context.tsx.
 */
// User type
export interface User {
  id: string
  email: string
  role: string
  firstName: string
  lastName: string
  organizationId?: string
  organizationName?: string
  /** Owns this organization. Cannot be removed or demoted until ownership moves. */
  isOwner?: boolean
  /** Works for a client or partner, not for this organization. Carried on the
   *  session so their own badge reads the same as the one an admin sees. */
  isExternal?: boolean
  /** IANA timezone of the org — the default display zone for all times on the
   *  client (attendance times override per-entry with the location's zone). */
  organizationTimezone?: string | null
  /** Org opted into the in-house vs external field-worker distinction — gates the
   *  employment-type UI + the €9 in-house seat. */
  orgUsesExternalWorkers?: boolean
  /** False for a freshly-registered "orphan" user who must complete onboarding. */
  onboardingCompleted?: boolean
  // Permission fields
  canCreateTasks: boolean
  taskCreationScope: string
  canViewAllTasks: boolean
  canAssignTasks: boolean
  canManageUsers: boolean
  canViewReports?: boolean
  // Capabilities split out of canManageUsers / canViewAllTasks. Optional: a token
  // minted before the split carries the old shape, and the server-side bridge
  // grants these to anyone who held the flag they came from.
  canManageWorkspaces?: boolean
  canManageRota?: boolean
  canManageInvoices?: boolean
  /** What labour COSTS, as opposed to what it bills at. */
  canViewLabourCost?: boolean
  canManageAssets?: boolean
  canManagePortals?: boolean
  canManageTaskTypes?: boolean
  canViewTracking?: boolean
  canReconcileAttendance?: boolean
  canViewSpaceAttendance?: boolean
  canApproveOvertime?: boolean
  /*
    Split out of broader keys for the permission builder (org-wide flat fields,
    bridges applied server-side by `orgFlagFields`). A grant held only in a
    workspace is read through `access.perSpace`, never these.
  */
  canApproveAttendance?: boolean
  canDeleteAttendance?: boolean
  canViewAssets?: boolean
  canLogAssets?: boolean
  canViewPortal?: boolean
  canAnswerPortal?: boolean
  canAddSpaceMembers?: boolean
  canGrantSpaceRoles?: boolean
  crmViewOwn?: boolean
  crmViewAll?: boolean
  crmWork?: boolean
  crmEditInfo?: boolean
  crmCreateClients?: boolean
  crmManageClients?: boolean
  allowRemote?: boolean
  presence?: "AVAILABLE" | "BUSY" | "AWAY" | null
  // Per-user clock display preference ("12h" | "24h"); display-only.
  timeFormat?: "12h" | "24h"
  // Several workspaces: clock in where they stand ("AUTO") or always choose ("ASK").
  clockInPick?: "AUTO" | "ASK"
  // One-time welcome-tour flag: false → auto-run the welcome guide once.
  guidesSeen?: boolean
  // Access Profile (mobile tabs / web screens) — array or object form.
  enabledModules: string[] | Record<string, unknown>
  // Org FEATURE modules (sprints, checklists, tracking…) — drives hasModule().
  orgModules?: string[]
  /*
    Modules switched on in workspaces this member can see.

    Modules are bought PER WORKSPACE, so the organization's own list answers a
    different question: a company running Assets on one site has it there and
    not on the org. Resolved with the session so the navigation can decide what
    to offer without loading the workspace list on every page.
  */
  spaceModules?: string[]
  // Billing tier + subscription status (lowercase) — drives hasPlanFeature().
  planTier?: string | null // LEGACY — nothing reads it to decide access
  orgAddOns?: string[] | null
  /** What the organization pays in — costs, statements, margins. */
  orgCurrency?: string
  /** Offline mode is switched on for this organization (phones keep and send work later). */
  offlineMode?: boolean
  subStatus?: string
  // Avatar
  avatarUrl?: string | null
  // Unified resolved access (Phase 2): org-wide ∪ per-space permission grants.
  access?: {
    org?: Record<string, boolean>
    perSpace?: Record<string, Record<string, boolean>>
    // ACTIVE cross-org shared spaces this user can open (guest side). Populated
    // by the backend on /auth/me so the guest UI needs no extra fetch.
    sharedSpaces?: SharedSpaceAccess[]
  }
}

/** An ACTIVE space shared with the current org, as surfaced in the auth context. */
export interface SharedSpaceAccess {
  spaceId: string
  ownerOrgId: string
  ownerOrgName: string
  spaceName: string
  level: "VIEW" | "CONTRIBUTE" | "CONTROL"
  showWorkers: boolean
  showAttendance: boolean
  showTracking: boolean
  showReports: boolean
  allowRequests: boolean
}

// Token info type
export interface TokenInfo {
  accessToken: string | null
  refreshToken: string | null
  accessTokenExp: Date | null
  refreshTokenExp: Date | null
}

export const EMPTY_TOKEN_INFO: TokenInfo = {
  accessToken: null,
  refreshToken: null,
  accessTokenExp: null,
  refreshTokenExp: null,
}

type MeResponse = NonNullable<Awaited<ReturnType<typeof authApi.getMe>>>

/**
 * The session's user as the client holds it.
 *
 * ⚠️ `canCreateTasks` is the SERVER's value. This used to be recomputed here as
 * "ADMIN, or canViewAllTasks, or any creation scope" — which showed a New Task
 * button to people the server then refused, and hid it from people it allowed.
 * Only a token minted before the field existed falls back to the scope.
 */
export function sessionUserFrom(u: MeResponse | Record<string, unknown>): User {
  const d = u as unknown as User & { taskCreationScope?: string; canCreateTasks?: boolean }
  const scope = d.taskCreationScope || (d.role === "ADMIN" ? "ORG" : d.canViewAllTasks ? "SPACE" : "NONE")
  return {
    ...d,
    taskCreationScope: scope,
    canCreateTasks: typeof d.canCreateTasks === "boolean" ? d.canCreateTasks : scope !== "NONE",
    avatarUrl: d.avatarUrl || null,
    enabledModules: d.enabledModules || [],
    orgModules: d.orgModules || [],
    spaceModules: d.spaceModules || [],
  }
}

/** Where a session that ended sends the reader, and why. */
export function loginPathFor(reason: SessionEndReason): string {
  return reason === "signed-out" ? "/login" : `/login?session=${reason}`
}

// Auth context type
export interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  tokenInfo: TokenInfo
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  /** Optimistically merge fields into the local user (e.g. presence) without a round-trip. */
  patchUser: (partial: Partial<User>) => void
  manualRefresh: () => Promise<boolean>
  /** Check if an organization module is enabled */
  hasModule: (module: string) => boolean
  /** Check if the org's billing tier is entitled to a premium feature/capability */
  hasPlanFeature: (feature: string) => boolean
  /** Check if the user has a specific permission (checks user fields + role permissions) */
  hasPermission: (perm: string) => boolean
}

// Create context
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Provider props
export interface AuthProviderProps {
  children: ReactNode
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
