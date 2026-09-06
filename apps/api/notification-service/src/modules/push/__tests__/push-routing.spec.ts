import { pushRouting, PUSH_CHANNELS, RETIRED_PUSH_CHANNELS } from '@hbcfield/shared';

/**
 * Where a push lands, and how loudly.
 *
 * Two platform rules make this worth a suite of its own: Android freezes a
 * channel's importance at creation, so a channel registered too quietly can only
 * be corrected by publishing a new id; and iOS silences an ordinary push under a
 * Focus mode, so a time-bound notification has to say it is time-bound.
 *
 * Both halves of that — the id and the level — are decided here and read by the
 * server AND the app, which is the only way they cannot drift.
 */
describe('push routing', () => {
  it('sends every attendance-family notification to the attendance channel', () => {
    for (const type of [
      'attendance_clock_in',
      'attendance_clock_out',
      'shift_reminder',
      'shift_escalation',
      'break_due',
      'break_over',
      'overtime_request',
      'overtime_decision',
      'noshow_escalation',
    ]) {
      expect(pushRouting(type).channelId).toBe(PUSH_CHANNELS.ATTENDANCE);
    }
  });

  it('marks them time-sensitive, which is what survives a Focus mode', () => {
    expect(pushRouting('break_due').interruptionLevel).toBe('time-sensitive');
    expect(pushRouting('shift_reminder').interruptionLevel).toBe('time-sensitive');
  });

  it('leaves everything else on the task channel at ordinary urgency', () => {
    for (const type of ['task_assigned', 'task_status', 'comment_added', 'join_request_submitted']) {
      const r = pushRouting(type);
      expect(r.channelId).toBe(PUSH_CHANNELS.TASKS);
      expect(r.interruptionLevel).toBe('active');
    }
  });

  it('treats an unknown or missing type as quiet — new categories interrupt only on purpose', () => {
    for (const type of [undefined, null, '', 'something_new']) {
      const r = pushRouting(type as string | undefined);
      expect(r.channelId).toBe(PUSH_CHANNELS.TASKS);
      expect(r.interruptionLevel).toBe('active');
    }
  });

  it('never routes to a retired channel id', () => {
    // The whole point of the version bump: `attendance` is frozen at
    // IMPORTANCE_DEFAULT on every phone that has ever run this app, so nothing
    // may address it again.
    const addressed = ['break_due', 'task_assigned', 'shift_reminder'].map((t) => pushRouting(t).channelId);
    for (const id of addressed) expect(RETIRED_PUSH_CHANNELS).not.toContain(id);
    expect(RETIRED_PUSH_CHANNELS).toContain('attendance');
  });

  it('is case-insensitive, so a capitalised type is not silently downgraded', () => {
    expect(pushRouting('Shift_Reminder').channelId).toBe(PUSH_CHANNELS.ATTENDANCE);
  });
});
