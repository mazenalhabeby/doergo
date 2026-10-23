import { type ContractFields } from './asset-contract-helpers';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

const MAX_FILE_SIZE = 15 * 1024 * 1024;

/** One person cannot fill somebody's queue by holding down the shutter. */
const MAX_OPEN_PER_MEMBER = 10;

/** How many waiting proposals are read before a scoped (or one workspace's) queue is narrowed. */
const PENDING_SCAN = 500;

/** The columns that decide where a proposal belongs. */
type Placeable = { id: string; categoryId: string | null; holderUserId: string | null; raisedById: string };

const PROPOSAL_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

/**
 * Where a member's pages live.
 *
 * ⚠️ Per MEMBER, not per organization. The prefix used to be the organization's,
 * so the submit check accepted any page uploaded by anyone in it: a member who
 * obtained a colleague's key could raise a proposal on it and then open the
 * colleague's rental agreement — home address, licence number, bank details —
 * through their own proposal's link.
 */
function proposalPrefix(organizationId: string, userId: string): string {
  return `${organizationId}/asset-proposals/${userId}/`;
}

/** The reading as kept: the eight known fields, trimmed, at most 120 characters each. */
function cleanProposalFields(raw: ContractFields | undefined): ContractFields {
  const out: ContractFields = {};
  for (const key of ['name', 'registration', 'vin', 'serial', 'manufacturer', 'model', 'startsOn', 'endsOn'] as const) {
    const v = raw?.[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 120);
  }
  return out;
}

export {
  proposalPrefix,
  cleanProposalFields,
  ALLOWED,
  MAX_FILE_SIZE,
  MAX_OPEN_PER_MEMBER,
  PENDING_SCAN,
  Placeable,
  PROPOSAL_STATUS,
};
