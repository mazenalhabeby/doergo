/** Module-level helpers of holidays.service.ts — moved here unchanged. */
import type { HolidayScope } from '@hbcfield/shared/microservices';

/** undefined = org-wide authority, [ids] = only these workspaces, [] = nowhere. */
type Scope = HolidayScope;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export { Scope, DATE };
