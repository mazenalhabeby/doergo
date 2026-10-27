import { Injectable } from '@nestjs/common';
import { DAY_APPROVABLE_KINDS, MAX_DAY_ITEMS, type ApprovalDayMember, type ApproveDayResult } from '@hbcfield/shared';
import { ApprovalsService, type ApprovalCaller } from './approvals.service';

/**
 * "Approve day" — a person's working day decided in one press, by replaying each
 * member item through `ApprovalsService.decide` (its OWN route, as the caller).
 * Nothing is written here and nothing is decided twice: an item the caller may
 * not decide, or a kind that needs more than a yes (extra time needs minutes),
 * is refused before anything is sent; the first refusal from a route stops the
 * replay and is reported with what went through before it.
 */
@Injectable()
export class ApprovalDaysService {
  constructor(private readonly approvals: ApprovalsService) {}

  async approveDay(caller: ApprovalCaller, members: ApprovalDayMember[]): Promise<ApproveDayResult> {
    const results: ApproveDayResult['results'] = [];
    const unique = [...new Map(members.map((m) => [`${m.kind}:${m.id}`, m])).values()].slice(0, MAX_DAY_ITEMS);
    for (const m of unique) {
      if (!(DAY_APPROVABLE_KINDS as readonly string[]).includes(m.kind)) {
        results.push({ ...m, ok: false, code: 'APPROVAL_DAY_NEEDS_REVIEW' });
        return { results, complete: false };
      }
      // Only what is in the caller's own inbox and theirs to decide — the same check the list made.
      const item = await this.approvals.item(caller, m.kind, m.id);
      if (!item || !item.canDecide) {
        results.push({ ...m, ok: false, code: 'APPROVAL_NOT_IN_INBOX' });
        return { results, complete: false };
      }
      const r = await this.approvals.decide(caller, { kind: m.kind, id: m.id, action: 'approve' });
      if (!r.ok) {
        results.push({ ...m, ok: false, code: r.code, message: r.message });
        return { results, complete: false };
      }
      // Approved by the caller; an office rule may still want somebody else — then the day is not finished.
      results.push({ ...m, ok: true, ...(r.stage === 'FIRST_STEP' ? { waitingFor: r.waitingFor } : {}) });
    }
    return { results, complete: results.every((x) => !x.waitingFor) };
  }
}
