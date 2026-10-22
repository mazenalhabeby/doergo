import { useEffect, useState } from 'react';
import { calendarApi, type LeaveCount } from '../../lib/api';
import { requestsApi } from '../../lib/api/technicians';
import type { MemberLeaveBalance } from '../../lib/leave-balance';

/**
 * What a leave range COSTS, asked of the server — the one count the request is
 * charged by: the workspace's weekend, public holidays and the member's own
 * rota (shared calendar/days.ts). Debounced, so dragging across days asks once.
 * Null while unknown (offline included); the caller falls back to its own count.
 *
 * Shared by the Requests tab's leave form and the Time tab's request sheet.
 */
export function useLeaveCost(userId: string | null | undefined, from: string | null, to: string | null): LeaveCount | null {
  const [cost, setCost] = useState<LeaveCount | null>(null);
  useEffect(() => {
    setCost(null);
    if (!userId || !from || !to) return;
    let live = true;
    const timer = setTimeout(() => {
      calendarApi.countLeave(userId, from, to).then((r) => { if (live) setCost(r); }).catch(() => undefined);
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [userId, from, to]);
  return cost;
}

export type LeaveBalance = MemberLeaveBalance;

/**
 * This leave year's balance and the lines it is built from — asked only while
 * a VACATION request is being made (`enabled`), once per form, never on the
 * screen's first paint. Offline it is the last answer kept (the endpoint is
 * `keep: true`). Null when it cannot be read; the preview then leaves it out.
 */
export function useLeaveBalance(userId: string | null | undefined, enabled: boolean): LeaveBalance | null {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  useEffect(() => {
    if (!enabled || !userId || balance) return;
    let live = true;
    requestsApi.leaveBalance(userId).then((b) => { if (live) setBalance(b); }).catch(() => undefined);
    return () => { live = false; };
  }, [enabled, userId, balance]);
  return balance;
}
