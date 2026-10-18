

// Org join code generation (reuses invitation charset)
export const ORG_CODE_LENGTH = 8;
export const ORG_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1

// Join request limits
export const JOIN_REQUEST_MAX_PENDING_PER_USER = 3;
export const JOIN_REQUEST_MAX_PENDING_PER_ORG = 100;
export const JOIN_REQUEST_MESSAGE_MAX_LENGTH = 500;
