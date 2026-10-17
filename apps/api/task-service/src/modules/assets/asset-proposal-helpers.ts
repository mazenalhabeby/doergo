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

export { ALLOWED, MAX_FILE_SIZE, MAX_OPEN_PER_MEMBER, PENDING_SCAN, Placeable, PROPOSAL_STATUS };
