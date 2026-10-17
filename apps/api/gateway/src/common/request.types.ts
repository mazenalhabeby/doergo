import type { Request } from 'express';
import type { AccessPermissionKey, AccessWithStandIn, CurrentUserData } from '@hbcfield/shared';
import type { PlatformValidateTokenReply } from '@hbcfield/shared/microservices';

/**
 * The validated session JwtAuthGuard puts on `req.user` — what auth-service's
 * validate_token returns. `CurrentUserData` is the part every service knows;
 * the rest are the fields the gateway itself reads (guards, scope helpers).
 * `access` is the full resolved set.
 */
export type SessionUser = Omit<CurrentUserData, 'access'> &
  /** Every permission key as an org-wide flag (auth-service orgFlagFields, bridges applied). */
  Partial<Record<AccessPermissionKey, boolean>> & {
    /** The resolved access set — cross-org shares and, while standing in, the stand-in's own access kept apart. */
    access?: AccessWithStandIn;
    isExternal?: boolean;
    /** Org-wide Options the organization bought — the only thing PlanGuard reads. */
    orgAddOns?: string[];
    orgCurrency?: string;
    /** Modules switched on in the workspaces this member can see. */
    spaceModules?: string[];
    /** A portal login confined to one asset (customers only). */
    assetId?: string | null;
    /** Issued-at of the access token, when the guard keeps it. */
    iat?: number;
    isOwner?: boolean;
    organizationName?: string | null;
    organizationTimezone?: string | null;
    offlineMode?: boolean;
  };

/** A request that passed JwtAuthGuard: `req.user` is set. */
export interface AuthedRequest extends Request {
  user: SessionUser;
}

/** The operator console's verified staff session (PlatformAuthGuard). */
type PlatformValid = Extract<PlatformValidateTokenReply, { valid: true }>;
export type PlatformUser = PlatformValid['user'] & { id?: string; email?: string };

/** A request on a /platform route — PlatformAuthGuard sets the three platform fields; a member token may sit beside them. */
export interface PlatformRequest extends Request {
  platformUser?: PlatformUser;
  platformPermissions?: PlatformValid['permissions'];
  platformSession?: Partial<PlatformValid['session']>;
  user?: SessionUser;
}

/** Any request, signed in or not — guards and interceptors that run before or without JwtAuthGuard. */
export type MaybeAuthedRequest = Request & { user?: SessionUser; rawBody?: Buffer };

/** What a refused RPC or an HttpException looks like when caught. */
export interface ServiceErrorLike {
  status?: number;
  statusCode?: number;
  response?: { statusCode?: number; message?: string | string[] };
  message?: string;
}
