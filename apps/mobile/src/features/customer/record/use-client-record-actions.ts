import { useCallback } from 'react';
import { customersApi, type MobileCustomerActivity } from '../../../lib/api';
import {
  customerStageLabel,
  REMINDER_KIND_KEYS,
  isReminderKind,
  reminderLeadKey,
  reminderRepeatKey,
} from '@hbcfield/shared/client';
import { clientLane, dependsOnClients, setActivityDoneFromPhone } from '../../../offline/crm/client-actions';
import type { ActivityTag, PendingActivity } from '../activity-row';
import type { ComposedActivity } from '../activity-composer';
import { useClientRecordData } from './use-client-record-data';

/** useClientRecord's state and handlers — everything before its markup, moved here unchanged. */
export function useClientRecordActions(id: string, linkedTab: string | undefined) {
  const data = useClientRecordData(id, linkedTab);
  const {
    t,
    toast,
    setActivities,
    seen,
    activityCreate,
    write,
    operations,
    refreshActivities,
  } = data;

  /*
    Tick a reminder off, or back on.

    Flipped here AND held by the outbox, deliberately. The local flip is what
    stops the row blinking back to its old state in the moment between the
    server accepting and the timeline being re-read; the outbox is what keeps it
    ticked when there is no signal at all — including on a reminder written
    minutes ago that the server has never seen, which is why it is offered on a
    waiting row now (the reminder's create carries the phone's id, and the tick
    names that create as the step it follows).
  */
  const toggleDone = useCallback(
    async (a: MobileCustomerActivity) => {
      const done = !a.doneAt;
      setActivities((list) =>
        list.map((x) => (x.id === a.id ? { ...x, doneAt: done ? new Date().toISOString() : null } : x)),
      );
      const outcome = await write.run(
        (e) => setActivityDoneFromPhone(e, { customerId: id, activityId: a.id, done }),
        () => customersApi.updateActivity(id, a.id, { done }),
      );
      if (outcome.kind === 'refused') {
        toast.error((outcome as { message?: string }).message || t('customers.record.reminderFailed'));
        await refreshActivities();
        return;
      }
      if (outcome.kind === 'done') await refreshActivities();
    },
    [id, refreshActivities, write, toast, t],
  );

  /**
   * A reminder's heading ALWAYS says what it is for.
   *
   * ⚠️ This is the one line that keeps two opposite things apart. An activity of
   * `type: 'CALL'` is a call that HAPPENED; a reminder whose `reminderKind` is
   * `CALL` is a call somebody still has to make. Printed as a bare "Reminder"
   * the second one is unreadable, and printed with a telephone icon it looks
   * like the first. "Reminder · Call" can be read only one way.
   *
   * An older reminder written before the phone could set a reason has none
   * stored; it keeps the plain heading rather than being labelled "Other",
   * which would assert something nobody chose.
   */
  const headingFor = useCallback(
    (a: PendingActivity): string => {
      if (a.type === 'STATUS') {
        return t('customers.record.stageChanged', {
          from: customerStageLabel(a.metadata?.from || ''),
          to: customerStageLabel(a.metadata?.to || ''),
        });
      }
      const label = t(`customers.record.act.${a.type}`, { defaultValue: a.type });
      if (a.type !== 'REMINDER' || !isReminderKind(a.reminderKind)) return label;
      return `${label} · ${t(REMINDER_KIND_KEYS[a.reminderKind])}`;
    },
    [t],
  );

  /**
   * How a reminder fires, when it has anything unusual to say.
   *
   * Only what differs from the default is shown: "at the time" and "does not
   * repeat" are what a reminder is unless it says otherwise, and printing them
   * on every row would bury the ones that matter.
   */
  const tagsFor = useCallback(
    (a: PendingActivity): ActivityTag[] | undefined => {
      if (a.type !== 'REMINDER') return undefined;
      const tags: ActivityTag[] = [];
      if (a.remindBeforeMin) tags.push({ label: t(reminderLeadKey(a.remindBeforeMin)) });
      if (a.repeat && a.repeat !== 'NONE') tags.push({ label: t(reminderRepeatKey(a.repeat)) });
      return tags.length ? tags : undefined;
    },
    [t],
  );

  /**
   * One entry, drawn the same way on both lists.
   *
   * ⚠️ `onToggleDone` is the stable `toggleDone`, never an arrow written here:
   * `ActivityRow` is memoised, and a fresh function per render would make every
   * comparison fail and the memo pure decoration. `headingFor` and `tagsFor`
   * are `useCallback`ed for the same reason.
   */
  const addActivity = useCallback(
    async (input: ComposedActivity): Promise<boolean> => {
      try {
        const outcome = await activityCreate.run(
          /*
          ⚠️ It names the client's own create when there is one. The id is
          already right (`add_customer_activity` honours the phone's, the same
          way `create_customer` does), but the client sits in the `crm:new`
          lane and a note sits in this one — different lanes keep no order
          between them, so without this a note could be pushed at a client the
          server has not been told about yet.
        */
          {
            lane: clientLane(id),
            params: { customerId: id },
            body: input,
            dependsOn: dependsOnClients(operations, id),
          },
          () => customersApi.addActivity(id, input),
        );
        if (outcome.kind === 'refused') return false;
        if (outcome.kind === 'done') await refreshActivities();
        return true;
      } catch {
        // The outbox reports its own failures; the draft stays so it is not lost.
        return false;
      }
    },
    [activityCreate, id, operations, refreshActivities],
  );

  return {
    ...data,
    toggleDone,
    headingFor,
    tagsFor,
    addActivity,
  };
}
