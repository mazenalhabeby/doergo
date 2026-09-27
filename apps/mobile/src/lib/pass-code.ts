import { JOIN_CODE_MAX_LENGTH, joinCodeCandidates } from '@hbcfield/shared/client';
import type { InvitationValidation } from './api/types';

/**
 * ONE field for both codes. Most people arrive holding an invitation, so the
 * first screen asks for "the code" and works out which kind it is — they no
 * longer have to know that an invitation and an organization join code are
 * different things before they can type either.
 */

/** What is kept of what was typed: letters and digits, upper case, never longer than a code. */
export const cleanPassCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, JOIN_CODE_MAX_LENGTH);

export type OrgLookup = { valid: boolean; organizationName?: string; joinPolicy?: string; message?: string };

export type PassLookup =
  | { kind: 'invite'; code: string; invite: InvitationValidation }
  | { kind: 'org'; code: string; org: OrgLookup }
  | { kind: 'none'; code: string };

/**
 * Which pass this code opens. An invitation is tried FIRST: at 8 characters a
 * code could be either, and invitations are what most people are holding.
 * A code of a length neither kind has is `none` without asking the server.
 */
export async function lookUpPassCode(
  code: string,
  api: { invitation: (c: string) => Promise<InvitationValidation>; org: (c: string) => Promise<OrgLookup> },
): Promise<PassLookup> {
  for (const kind of joinCodeCandidates(code, 'INVITATION')) {
    if (kind === 'INVITATION') {
      const invite = await api.invitation(code);
      if (invite?.valid) return { kind: 'invite', code, invite };
    } else {
      const org = await api.org(code);
      if (org?.valid) return { kind: 'org', code, org };
    }
  }
  return { kind: 'none', code };
}

/** Whole days left on an invitation, or null when it states no end. Never below zero. */
export function daysLeft(expiresAt: string | undefined, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
