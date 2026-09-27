import type { ManageRow } from '../../lib/manage-rows';

export type MoreGroupKey = 'time' | 'people' | 'work';
export interface MoreGroup { key: MoreGroupKey; rows: ManageRow[] }

/**
 * Which group each management door belongs to on the More page — by what it
 * is FOR: hours and leave, the people in the organization, the work itself.
 *
 * ⚠️ A ROUTE NOBODY FILED LANDS IN "WORK", never nowhere. A door added to
 * `manage-rows.ts` without a line here still shows up; it is simply filed
 * under the broadest heading until somebody places it.
 */
const GROUP_OF: Record<string, MoreGroupKey> = {
  '/(app)/manage/attendance': 'time',
  '/(app)/extra-time': 'time',
  '/(app)/manage/time-off-requests': 'time',
  '/(app)/manage/schedules': 'time',
  'sheet:issues': 'time',
  '/(app)/manage/members': 'people',
  '/(app)/manage/invitations': 'people',
  '/(app)/manage/join-requests': 'people',
  '/(app)/customers': 'work',
  '/(app)/asset-contract': 'work',
};

const ORDER: MoreGroupKey[] = ['time', 'people', 'work'];

/** The rows a member has, grouped, in the order the table lists them; empty groups are left out. */
export function groupManageRows(rows: readonly ManageRow[]): MoreGroup[] {
  return ORDER
    .map((key) => ({ key, rows: rows.filter((r) => (GROUP_OF[r.route] ?? 'work') === key) }))
    .filter((g) => g.rows.length > 0);
}
