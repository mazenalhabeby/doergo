/**
 * The record itself — its state, the facts on its plate, and who may change it.
 *
 * `Asset.status`, the serial number, the warranty and the notes all existed on
 * the table from the first migration and no screen ever wrote them. The rules
 * that decide what those fields MEAN live here, once, because three places ask:
 * the form that sets them, the list that filters on them, and the service that
 * refuses a bad one. A rule copied into each would be three rules the first
 * time anybody changed one.
 *
 * Pure and dependency-free apart from the permission resolver, so the phone,
 * the browser and the server read the same answers.
 */

import { isAdmin } from '../guards/role-helpers';
import { spacesGranting, type ResolvedAccess } from '../types/permissions';

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every state a record can be in, in the order a person reads them.
 *
 * Not the enum's declaration order: "In maintenance" is the one that matters
 * day to day, and "Retired" is the one somebody picks last and on purpose, so
 * it goes at the end of every menu.
 */
export const ASSET_STATUS_ORDER = ['ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED'] as const;
export type AssetStatusKey = (typeof ASSET_STATUS_ORDER)[number];

/** Is this one of the four? The queue path reaches the service without a DTO. */
export function isAssetStatus(value: unknown): value is AssetStatusKey {
  return typeof value === 'string' && (ASSET_STATUS_ORDER as readonly string[]).includes(value);
}

/**
 * What a picker may offer.
 *
 * ⚠️ RETIRED IS KEPT, NOT OFFERED. Retiring is the product's answer to "this
 * is out of service but has a history" — the jobs, the money and the custody
 * stay exactly where they are. What stops is its being chosen for anything
 * NEW: a client raising a request against the van sold last year, a list that
 * leads with records nobody uses any more.
 *
 * The same exclusion billing makes (`BILLABLE_ASSET_WHERE`), stated separately
 * on purpose: "not charged for" and "not offered" happen to agree today, and a
 * future state such as "on loan" could easily be billed and not offered. Two
 * names for two questions keeps that change a one-line edit.
 *
 * A plain object, not a Prisma import: shared must not depend on the ORM.
 */
export const SELECTABLE_ASSET_WHERE = {
  status: { not: 'RETIRED' },
} as const;

/** The same rule, asked of a row already in hand. */
export function isSelectableAsset(asset: { status?: string | null } | null | undefined): boolean {
  return !!asset && asset.status !== 'RETIRED';
}

// ─────────────────────────────────────────────────────────────────────────────
// The plate: serial, maker, model, dates, notes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long each free-text fact may be.
 *
 * The DTO and the form both read these, so the box stops typing at exactly the
 * length the server would refuse rather than after somebody has pasted a page.
 */
export const ASSET_RECORD_LIMITS = {
  serialNumber: 100,
  manufacturer: 100,
  model: 100,
  notes: 2000,
} as const;

/** "Expiring soon" means inside this many days. */
export const WARRANTY_SOON_DAYS = 30;

const DAY_MS = 86_400_000;

const toMs = (v: Date | string | null | undefined): number =>
  v == null || v === '' ? Number.NaN : (v instanceof Date ? v : new Date(v)).getTime();

/**
 * Where a warranty stands.
 *
 * `null` when there is none, so a record with no warranty says nothing rather
 * than "expired". The expiry DAY still counts as covered: a warranty that ends
 * on the 30th covers a repair on the 30th, and flagging it red that morning
 * would be wrong on the one day it matters.
 */
export function warrantyState(
  expiry: Date | string | null | undefined,
  now: Date = new Date(),
): 'expired' | 'soon' | 'ok' | null {
  const end = toMs(expiry);
  if (Number.isNaN(end)) return null;
  if (end + DAY_MS <= now.getTime()) return 'expired';
  if (end - now.getTime() <= WARRANTY_SOON_DAYS * DAY_MS) return 'soon';
  return 'ok';
}

export type AssetDateProblem = 'install-invalid' | 'warranty-invalid' | 'warranty-before-install';

/**
 * What is wrong with a pair of dates, if anything.
 *
 * Asked of the values the record WILL have, not of the request: on a partial
 * update somebody may send only the warranty, and it must still be compared
 * with the install date already stored.
 *
 * A warranty ending before the thing was installed is always a typo (usually a
 * transposed year), and stored it reads as "expired" from the day it is entered.
 */
export function assetDateProblems(input: {
  installDate?: Date | string | null;
  warrantyExpiry?: Date | string | null;
}): AssetDateProblem[] {
  const problems: AssetDateProblem[] = [];
  const hasInstall = input.installDate != null && input.installDate !== '';
  const hasWarranty = input.warrantyExpiry != null && input.warrantyExpiry !== '';
  const install = toMs(input.installDate);
  const warranty = toMs(input.warrantyExpiry);
  if (hasInstall && Number.isNaN(install)) problems.push('install-invalid');
  if (hasWarranty && Number.isNaN(warranty)) problems.push('warranty-invalid');
  if (!Number.isNaN(install) && !Number.isNaN(warranty) && warranty < install) {
    problems.push('warranty-before-install');
  }
  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// Who may manage the register — and where
// ─────────────────────────────────────────────────────────────────────────────

type AssetManager =
  | {
      role?: string | null;
      canManageAssets?: boolean;
      canManageUsers?: boolean;
      access?: unknown;
    }
  | null
  | undefined;

/**
 * The workspaces in which this member may manage assets.
 *
 * `null` means everywhere — an admin, or the permission held org-wide — and an
 * empty array means nowhere. Those are different TYPES on purpose: collapsing
 * them into one falsy value is exactly how a scoping bug turns into a leak.
 *
 * The flat `canManageAssets` column is the ORG-wide resolution (auth-service
 * folds the legacy `canManageUsers` into it), so holding it is org-wide by
 * definition. A token minted before the capability existed carries only
 * `canManageUsers`, which is honoured for the same reason.
 */
export function assetManageSpaces(user: AssetManager): string[] | null {
  if (!user) return [];
  if (user.role && isAdmin({ role: user.role })) return null;
  if (user.canManageAssets === true) return null;
  if (user.canManageAssets === undefined && user.canManageUsers === true) return null;
  return spacesGranting(user.access as ResolvedAccess | null | undefined, 'canManageAssets');
}

/**
 * May this member manage assets IN THIS workspace?
 *
 * A Space Manager holds `canManageAssets` in their own space and nowhere else.
 * Asking the org-wide column alone refused them the contract flow for the vans
 * their own depot runs — while it is the space-scoped person who is standing
 * at the desk when the rental agreement arrives.
 *
 * Without a `spaceId` this answers "anywhere", which is the right question for
 * whether to show an entry point that then lists only their own kinds.
 *
 * This decides what to RENDER. The server narrows independently by the kind's
 * real workspace, so a wrong answer here only shows or hides a button.
 */
export function canManageAssetsIn(user: AssetManager, spaceId?: string | null): boolean {
  const spaces = assetManageSpaces(user);
  if (spaces === null) return true;
  if (!spaceId) return spaces.length > 0;
  return spaces.includes(spaceId);
}
