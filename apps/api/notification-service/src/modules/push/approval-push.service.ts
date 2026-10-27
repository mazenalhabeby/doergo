import type { RuleKind } from '@hbcfield/shared';
import { Inject, Injectable } from '@nestjs/common';
import { msg, type LocalizedText } from '../../i18n/translate';
import { overtimeRequestText } from './push-helpers';
import { PushService } from './push.service';

/** Pushes about decisions: a second step, a reminder, extra time and leave asked and decided. */
@Injectable()
export class ApprovalPushService {
  @Inject(PushService) private readonly push!: PushService;

  /** An office rule: the first approval is in, and these people must give the second. */
  async sendApprovalSecondStepPush(data: {
    recipientIds: string[];
    kind: string;
    itemId: string;
    firstName: string;
    subjectName?: string;
  }) {
    return this.push.sendToUsers(
      data.recipientIds,
      {
        title: msg('approval.secondStep.title'),
        body: data.subjectName
          ? msg('approval.secondStep.bodyAbout', { first: data.firstName, subject: data.subjectName })
          : msg('approval.secondStep.body', { first: data.firstName }),
      },
      { type: 'approval_second_step', kind: data.kind, itemId: data.itemId },
    );
  }

  /** Nobody answered: remind the usual deciders, or pass it to the escalation role. */
  async sendApprovalReminderPush(data: {
    recipientIds: string[];
    kind: RuleKind;
    itemId: string;
    stage: 'REMIND' | 'ESCALATE';
    subjectName: string;
    hours: number;
  }) {
    const what = msg(`approval.what.${data.kind}`);
    const facts = { subject: data.subjectName, what, hours: data.hours };
    return this.push.sendToUsers(
      data.recipientIds,
      data.stage === 'ESCALATE'
        ? { title: msg('approval.escalate.title'), body: msg('approval.escalate.body', facts) }
        : { title: msg('approval.remind.title'), body: msg('approval.remind.body', facts) },
      { type: 'approval_reminder', kind: data.kind, itemId: data.itemId, stage: data.stage },
    );
  }

  // A worker asked to keep working past their shift — notify the space's
  // overtime approvers so they can grant/deny extra minutes.
  async sendOvertimeRequestPush(data: {
    leaderIds: string[];
    userName: string;
    locationName: string;
    entryId: string;
  }) {
    return this.push.sendToUsers(data.leaderIds, overtimeRequestText(data.userName, data.locationName), {
      type: 'overtime_request',
      userName: data.userName,
      entryId: data.entryId,
    });
  }

  // Tell the worker whether their extra time was approved (and for how long) or
  // rejected (they should clock out now).
  async sendOvertimeDecisionPush(data: {
    userId: string;
    entryId: string;
    decision: 'approved' | 'rejected';
    minutes?: number;
  }) {
    const approved = data.decision === 'approved';
    return this.push.sendToUser(
      data.userId,
      {
        title: msg(
          approved ? 'attendance.overtimeDecision.titleApproved' : 'attendance.overtimeDecision.titleDeclined',
        ),
        body: !approved
          ? msg('attendance.overtimeDecision.bodyDeclined')
          : data.minutes
            ? msg('attendance.overtimeDecision.bodyApprovedMinutes', { minutes: data.minutes })
            : msg('attendance.overtimeDecision.bodyApproved'),
      },
      {
        type: 'overtime_decision',
        entryId: data.entryId,
        decision: data.decision,
        minutes: data.minutes,
      },
    );
  }

  /**
   * A member asked for days off → the people routed to hear about them.
   *
   * `recipientIds`, not `dispatcherIds`: who is told is resolved from the
   * member's own routing (their Access watchers, then their spaces' notify
   * config), which has nothing to do with holding any particular role.
   */
  async sendTimeOffRequestPush(data: {
    recipientIds: string[];
    text: LocalizedText;
    technicianName: string;
    startDate: string;
    endDate: string;
  }) {
    return this.push.sendToUsers(data.recipientIds, data.text, {
      type: 'time_off_request',
      technicianName: data.technicianName,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }

  async sendTimeOffApprovedPush(data: {
    technicianId: string;
    text: LocalizedText;
    startDate: string;
    endDate: string;
    approved: boolean;
  }) {
    return this.push.sendToUser(data.technicianId, data.text, {
      type: 'time_off_response',
      approved: data.approved,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }
}
