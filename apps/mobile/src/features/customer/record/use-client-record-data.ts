import { useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@/lib/constants';
import { useQueuedCreate } from '@/offline/actions/queued-create';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import { useSyncStatus } from '@/offline/offline-context';
import { applyPendingContacts, pendingContactLinks } from '@/offline/crm/client-overlay';
import { useToast } from '@/island/island-context';
import type { PendingActivity } from '../activity-row';
import type { ComposedActivity } from '../activity-composer';
import type { ReminderAssignee } from '../reminder-fields';
import { useAuth } from '@/contexts/auth-context';
import type { ContactSide } from '../add-contact-sheet';
import { FILTERS, isOverdue, byDue } from './client-record-helpers';
import { useClientRecordState } from './use-client-record-state';

/** useClientRecord's state and handlers — everything before its markup, moved here unchanged. */
export function useClientRecordData(id: string, linkedTab: string | undefined) {
  const data = useClientRecordState(id, linkedTab);
  const {
    t,
    user,
    activities,
    contacts,
    companies,
    addresses,
    filter,
    showDone,
    tab,
    activityCreate,
    operations,
    record,
    doneOffline,
  } = data;

  const shownActivities = useMemo<PendingActivity[]>(() => {
    const known = new Set(activities.map((a) => a.id));
    const onPhone = activityCreate.pending
      .filter((p) => p.params.customerId === id && !known.has(p.id))
      .map(
        (p) =>
          ({
            id: p.id,
            type: p.body.type,
            body: p.body.body ?? null,
            dueAt: p.body.dueAt ?? null,
            doneAt: null,
            // Carried through so a queued reminder reads the same as a sent one —
            // it would otherwise lose its reason on the way to the outbox and read
            // as a bare "Reminder" until the signal came back.
            reminderKind: p.body.reminderKind ?? null,
            remindBeforeMin: p.body.remindBeforeMin ?? null,
            repeat: p.body.repeat ?? null,
            createdAt: new Date(p.createdAt).toISOString(),
            pendingSync: true,
          }) as unknown as PendingActivity,
      );
    const all = [...onPhone, ...activities];
    /*
      A reminder ticked off with no signal reads as ticked off, here and on
      every count derived from this list. Rows the overlay says nothing about
      keep their identity, so a tick on one reminder does not re-render two
      hundred others.
    */
    if (!doneOffline.size) return all;
    return all.map((a) => {
      const doneAt = doneOffline.get(a.id);
      return doneAt === undefined || doneAt === (a.doneAt ?? null) ? a : { ...a, doneAt };
    });
  }, [activities, activityCreate.pending, doneOffline, id]);

  /*
    The two contact panels: what the server has, less what is queued to be
    detached, plus what is queued to be attached.

    ⚠️ A waiting row carries the OPERATION's id, not a link id — there is no
    link until the server mints one. That is what makes "remove" on such a row
    mean "cancel the attachment" rather than "delete a link", and why the star
    is not offered on it: `PATCH /customers/contacts/:linkId` addresses an id
    the phone cannot know. Adding somebody AS the primary contact is expressible
    on the attachment itself, so the common case loses nothing.
  */
  const shownContacts = useMemo(
    () => [...applyPendingContacts(contacts, operations), ...pendingContactLinks(operations, id, 'person')],
    [contacts, operations, id],
  );
  const shownCompanies = useMemo(
    () => [...applyPendingContacts(companies, operations), ...pendingContactLinks(operations, id, 'company')],
    [companies, operations, id],
  );

  const feed = useMemo(() => {
    const kinds = FILTERS.find((f) => f.key === filter)?.types;
    return kinds ? shownActivities.filter((a) => (kinds as readonly string[]).includes(a.type)) : shownActivities;
  }, [shownActivities, filter]);

  /*
    Reminders, and the two numbers the tab bar prints.

    ⚠️ Derived from the activities already in hand — never a second request.
    One list is the source of the feed, the badge, the banner and this tab, so
    ticking a reminder off moves all four in the same render and none of them
    can disagree with another.
  */
  const { openReminders, doneReminders, overdueCount } = useMemo(() => {
    const now = Date.now();
    const all = shownActivities.filter((a) => a.type === 'REMINDER');
    return {
      openReminders: all.filter((a) => !a.doneAt).sort(byDue),
      doneReminders: all.filter((a) => !!a.doneAt),
      overdueCount: all.filter((a) => isOverdue(a, now)).length,
    };
  }, [shownActivities]);

  const reminderRows = useMemo(
    () => (showDone ? [...openReminders, ...doneReminders] : openReminders),
    [openReminders, doneReminders, showDone],
  );

  const canEditInfo = record?.crmCaps?.editInfo === true;
  const canWork = record?.crmCaps?.work === true;

  /*
    WHO A REMINDER CAN BE POINTED AT — the caller, and only if they manage this
    client.

    ⚠️ Deliberately NOT a member list. The web builds its picker from
    `GET /organizations/members`, which asks `canManageUsers` — a permission the
    sales rep and the field member who live on this screen will never hold, so
    the list would render empty for exactly the people it is for. The one
    directory they CAN reach (`GET /organizations/contacts`) is worse than
    nothing here: it is filtered to elevated-permission holders, obeys the
    caller's own contact policy (NONE returns an empty array) and explicitly
    EXCLUDES the caller — so it would omit managers silently, and omit the
    single most likely answer, "remind me". A list stricter than the rule it
    mirrors is the failure this codebase keeps re-learning.

    So: "Everyone" (null, every manager of the client — what the server already
    does) plus "Me" when that is true. Naming somebody else needs a member
    lookup these callers can reach, which does not exist yet. Restricted to
    `managerIds` exactly as the web is — the server accepts ANY org member as an
    assignee, so the restriction is the client's to keep.
  */
  const assignees = useMemo<ReminderAssignee[]>(() => {
    const managers = record?.managerIds ?? [];
    if (!user?.id || !managers.includes(user.id)) return [];
    return [{ id: user.id, label: t('customers.record.reminderForm.me') }];
  }, [record?.managerIds, user?.id, t]);

  /*
    Raise a job for this client.

    Only when the client is filed in a workspace — a task belongs to one, and a
    client filed in none (the majority in a real book) has nowhere to put it.
    The web gates the same button on the same fact.

    The client and its workspace travel as params; the create screen adopts them
    and clears them, so the tab opened normally afterwards is a blank form.
  */
  const openTask = useCallback(() => {
    if (!record?.spaceId) return;
    router.push({
      pathname: ROUTES.createTask,
      params: { customerId: record.id, spaceId: record.spaceId, customerName: record.name },
    } as never);
  }, [record?.id, record?.spaceId, record?.name]);

  const relTime = useCallback(
    (iso: string) => {
      const secs = (Date.now() - new Date(iso).getTime()) / 1000;
      if (secs < 60) return t('customers.record.justNow');
      if (secs < 3600) return `${Math.floor(secs / 60)}m`;
      if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
      if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },
    [t],
  );

  return {
    ...data,
    shownContacts,
    shownCompanies,
    feed,
    openReminders,
    doneReminders,
    overdueCount,
    reminderRows,
    canEditInfo,
    canWork,
    assignees,
    openTask,
    relTime,
  };
}
