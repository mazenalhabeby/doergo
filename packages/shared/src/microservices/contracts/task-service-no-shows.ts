/** task-service: no-shows — the list, settling one, the summary. */
import { rpc } from '../contract';
import type { AttendanceScope } from '../../access/space-scope';

export const listNoShows = rpc<{
  organizationId: string;
  days?: number;
  spaceId?: string;
  scopeSpaceIds?: AttendanceScope;
  open?: boolean;
}>('list_no_shows');

export const resolveNoShow = rpc<{
  id: string;
  organizationId: string;
  action: 'excuse' | 'absent' | 'reopen';
  reasonCode?: string;
  reason?: string;
  wholeRun?: boolean;
  excusedById?: string;
  scopeSpaceIds?: AttendanceScope;
}>('resolve_no_show');

export const noShowSummary = rpc<{
  organizationId: string;
  days?: number;
  spaceId?: string;
  scopeSpaceIds?: AttendanceScope;
}>('no_show_summary');
