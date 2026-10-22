import { ASSET_FILE_MIMES, ASSET_FILE_MAX_BYTES } from '../core/asset-files';

/** A receipt is a photograph or a PDF — the one definition, shared with the logbook. */
const ALLOWED = ASSET_FILE_MIMES;

const MAX_FILE_SIZE = ASSET_FILE_MAX_BYTES;

export const EXPENSE_STATUS = { SUBMITTED: 'SUBMITTED', RECORDED: 'RECORDED', REJECTED: 'REJECTED' } as const;

export { ALLOWED, MAX_FILE_SIZE };
