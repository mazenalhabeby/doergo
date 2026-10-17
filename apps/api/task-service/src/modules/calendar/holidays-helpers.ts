/** Module-level helpers of holidays.service.ts — moved here unchanged. */

/** undefined = org-wide authority, [ids] = only these workspaces, [] = nowhere. */
type Scope = string[] | undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export { Scope, DATE };
