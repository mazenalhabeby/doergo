import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, type MobileCustomer, type MobileCustomerActivity } from '../../../lib/api';
import type { MobileCustomerContact, MobileCustomerAddress } from '../../../lib/api/customers';
import {
  customerStageLabel,
  REMINDER_KIND_KEYS,
  isReminderKind,
  reminderLeadKey,
  reminderRepeatKey,
} from '@hbcfield/shared/client';
import { ROUTES } from '../../../lib/constants';
import { useQueuedCreate } from '../../../offline/actions/queued-create';
import { useQueuedWrite } from '../../../offline/actions/queued-write';
import { useSyncStatus } from '../../../offline/offline-context';
import {
  clientLane,
  dependsOnClients,
  updateClientFromPhone,
  updateContactFromPhone,
  removeContactFromPhone,
  discardPendingContact,
  setActivityDoneFromPhone,
} from '../../../offline/crm/client-actions';
import {
  applyPendingClient,
  applyPendingContacts,
  pendingActivityDone,
  pendingContactLinks,
  type PendingContactLink,
} from '../../../offline/crm/client-overlay';
import { clientLocalePayload } from '../../../lib/client-locale';
import { useToast } from '../../../island/island-context';
import type { ActivityTag, PendingActivity } from '../activity-row';
import type { ComposedActivity } from '../activity-composer';
import type { ReminderAssignee } from '../reminder-fields';
import { useAuth } from '../../../contexts/auth-context';
import type { ContactSide } from '../add-contact-sheet';

/*
  THE CLIENT RECORD — its data and every act on it, with no drawing.

  Lifted out of the screen whole when the record was redrawn: the loading,
  the outbox overlay (a change made with no signal shows at once and rolls
  itself back when the server refuses), the abilities read off the record,
  and every write. The views read this and nothing else.

  Three tabs, because there are three different jobs:
    ABOUT       who they are, where we stand, who to ask for, where to go
    ACTIVITY    what has happened — the composer and the whole feed
    REMINDERS   what has NOT happened yet, and what is late
*/

export const TABS = ['information', 'activity', 'reminders'] as const;
export type RecordTab = (typeof TABS)[number];
export const isTab = (v: unknown): v is RecordTab => typeof v === 'string' && (TABS as readonly string[]).includes(v);

/** What the Activity feed is narrowed to. A note and a call are the two kinds a member files. */
export const FILTERS = [
  { key: 'all', label: 'customers.record.filter.all', types: null },
  { key: 'notes', label: 'customers.record.filter.notes', types: ['NOTE'] },
  { key: 'calls', label: 'customers.record.filter.calls', types: ['CALL'] },
] as const;
export type ActivityFilter = (typeof FILTERS)[number]['key'];

/**
 * A contact row that exists only in the outbox. It carries the OPERATION's id
 * rather than a link id — there is no link until the server mints one — which
 * decides both what "remove" means on it and whether the star is offered.
 */
export const isWaiting = (link: MobileCustomerContact | PendingContactLink): link is PendingContactLink =>
  (link as PendingContactLink).waiting === true;

const isOverdue = (a: MobileCustomerActivity, now: number) =>
  a.type === 'REMINDER' && !!a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now;

/** Soonest first, so whatever is most overdue is the first thing on the tab. */
function byDue(a: MobileCustomerActivity, b: MobileCustomerActivity): number {
  const av = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bv = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  return av - bv;
}

export function useClientRecord(id: string, linkedTab: string | undefined) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<MobileCustomer | null>(null);
  const [activities, setActivities] = useState<MobileCustomerActivity[]>([]);
  const [contacts, setContacts] = useState<MobileCustomerContact[]>([]);
  const [companies, setCompanies] = useState<MobileCustomerContact[]>([]);
  const [addresses, setAddresses] = useState<MobileCustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [localeOpen, setLocaleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  /*
    WHICH END is being attached, or null for closed.

    One sheet, not two: the direction is a prop, and mounting a second copy per
    card would give the phone two BlurSheets whose reset effects both fire on
    every open.
  */
  const [adding, setAdding] = useState<ContactSide | null>(null);
  const [busyLink, setBusyLink] = useState<string | null>(null);
  // `opId` is present only on a row that has never been sent — see confirmRemove.
  const [removing, setRemoving] = useState<(MobileCustomerContact & { opId?: string }) | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [showDone, setShowDone] = useState(false);

  /*
    WHICH TAB, and which tabs have ever been opened.

    ⚠️ A tab is mounted the first time it is asked for, and then KEPT — the
    panes that have never been visited render `null`, and a pane that has been
    visited stays mounted with `display: 'none'` when another one is showing.
    Unmounting on every switch is the easy version and the wrong one: it throws
    away the list's scroll position, so a member reading the tenth entry, tapping
    Reminders and coming back lands at the top again, and it re-runs whatever the
    pane does on mount. Keeping a hidden pane costs a detached native view.

    The deep link (`?tab=reminders`) decides the FIRST tab rather than switching
    to it after the fact, so a `crm_reminder` push never mounts Information just
    to hide it a frame later.
  */
  const [tab, setTab] = useState<RecordTab>(() => (isTab(linkedTab) ? linkedTab : 'information'));
  const [seen, setSeen] = useState<Record<RecordTab, boolean>>(() => {
    const first = isTab(linkedTab) ? linkedTab : 'information';
    // Only the tab actually being opened. A deep link straight to Reminders
    // must not pay for a hero and five cards nobody has asked to see.
    return { information: first === 'information', activity: first === 'activity', reminders: first === 'reminders' };
  });

  const selectTab = useCallback((next: RecordTab) => {
    setTab(next);
    setSeen((v) => (v[next] ? v : { ...v, [next]: true }));
  }, []);

  // A second push for the same client while the screen is already open changes
  // the param without remounting; the initial state above would never see it.
  useEffect(() => {
    if (isTab(linkedTab)) selectTab(linkedTab);
  }, [linkedTab, selectTab]);

  // Notes and reminders written with no signal wait in the outbox; shown at the top meanwhile.
  const loadRef = useRef<(() => Promise<void>) | null>(null);
  const activityCreate = useQueuedCreate<ComposedActivity>(
    'customer.activity',
    { onAccepted: () => void loadRef.current?.() },
  );

  /*
    EVERY write on this screen goes through the outbox.

    `write.run` takes the queued action and the API call the screen always made,
    and picks between them: a store binary without the offline layer has no
    engine and still reaches the server. `operations` is what the queued changes
    are READ back from — a queued change is a fact in the outbox, not state in
    this component, so it survives walking to another screen and back, and it
    rolls itself back when the server refuses (the refusal discards the
    operation, and the overlay it fed stops existing).
  */
  const write = useQueuedWrite();
  const { operations } = useSyncStatus();

  /**
   * The timeline on its own.
   *
   * ⚠️ Not `load()`. A stage change and a reminder tick are single-field
   * optimistic writes whose ONLY other visible effect is a new timeline entry
   * the server wrote. Re-reading the whole record to see it would also
   * re-read — and could momentarily un-apply — the field just changed on
   * screen, and would cost four more requests for a line of text.
   */
  const refreshActivities = useCallback(async () => {
    try { setActivities(await customersApi.activities(id)); } catch { /* the timeline simply lags */ }
  }, [id]);

  /**
   * The "Works at" list on its own.
   *
   * ⚠️ Same reasoning as `refreshActivities`, and for one specific reason: the
   * link `addContact` hands back carries the person end and not the company
   * end, so this one list cannot be updated from the response and has to be
   * re-read. Re-reading the whole record for it would cost four more requests
   * and could momentarily un-apply an optimistic stage change on screen.
   */
  const refreshCompanies = useCallback(async () => {
    try { setCompanies(await customersApi.companies(id)); } catch { /* the panel simply lags */ }
  }, [id]);

  /**
   * The "Contact people" list on its own — same reasoning as the two above.
   *
   * ⚠️ Read back rather than appended from the answer. A contact may now be
   * attached through the outbox, where "the answer" is a push result rather
   * than the route's own response, and a screen that adopted whichever shape
   * came back would disagree with itself depending on the signal. One request,
   * on an action a member takes rarely.
   */
  const refreshContacts = useCallback(async () => {
    try { setContacts(await customersApi.contacts(id)); } catch { /* the panel simply lags */ }
  }, [id]);

  /**
   * Everything the screen needs, in one round trip's worth of time.
   *
   * ⚠️ The activities are read HERE, with the record, and NOT deferred until
   * the Activity tab is opened. Deferring looks like a free saving and is not:
   * the reminder badge on the tab bar and the "something is overdue" banner are
   * both computed from this list, and a record that opens saying nothing about
   * an overdue follow-up is worse than a record that costs one more request.
   * What the tabs save is RENDERING two hundred rows, which is the expensive
   * half — not fetching them.
   *
   * ⚠️ `allSettled`, not `all`. The contact and address reads carry their own
   * CRM gates, so a member who may read the client but not its contacts gets a
   * refusal on one of five promises — and with `all` that refusal would blank
   * the whole record, leaving "Not found" for a client that plainly exists.
   *
   * ⚠️ Both ENDS of the contact link are asked, before the kind is known. The
   * kind arrives with the record, so waiting for it would make these two
   * sequential; and the Person/Company toggle is an afterthought on real data —
   * a book full of "BILLA AG" saved as PERSON — so a company saved as a person
   * would otherwise hide its own staff. Two cheap reads beat a round trip and
   * a wrong answer.
   */
  const load = useCallback(async () => {
    const [c, acts, ppl, cos, addrs] = await Promise.allSettled([
      customersApi.get(id),
      customersApi.activities(id),
      customersApi.contacts(id),
      customersApi.companies(id),
      customersApi.addresses(id),
    ]);
    if (c.status === 'fulfilled') setCustomer(c.value);
    if (acts.status === 'fulfilled') setActivities(acts.value);
    if (ppl.status === 'fulfilled') setContacts(ppl.value);
    if (cos.status === 'fulfilled') setCompanies(cos.value);
    if (addrs.status === 'fulfilled') setAddresses(addrs.value);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  loadRef.current = load;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /*
    THE RECORD AS THE MEMBER LAST LEFT IT — the server's copy plus whatever is
    still in the outbox for it.

    ⚠️ `applyPendingClient` hands back the very object it was given when nothing
    is waiting, so the common case costs nothing and every memo below it keeps
    its identity. `operations` moves whenever anything anywhere in the outbox
    does (somebody starts a rest break), and this screen sits above two
    memoised lists.
  */
  const record = useMemo(() => (customer ? applyPendingClient(customer, operations) : null), [customer, operations]);

  const doneOffline = useMemo(() => pendingActivityDone(operations), [operations]);

  const shownActivities = useMemo<PendingActivity[]>(() => {
    const known = new Set(activities.map((a) => a.id));
    const onPhone = activityCreate.pending
      .filter((p) => p.params.customerId === id && !known.has(p.id))
      .map((p) => ({
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
      }) as unknown as PendingActivity);
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

  const relTime = useCallback((iso: string) => {
    const secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (secs < 60) return t('customers.record.justNow');
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, [t]);

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
  const toggleDone = useCallback(async (a: MobileCustomerActivity) => {
    const done = !a.doneAt;
    setActivities((list) => list.map((x) => (x.id === a.id ? { ...x, doneAt: done ? new Date().toISOString() : null } : x)));
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
  }, [id, refreshActivities, write, toast, t]);

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
  const headingFor = useCallback((a: PendingActivity): string => {
    if (a.type === 'STATUS') {
      return t('customers.record.stageChanged', {
        from: customerStageLabel(a.metadata?.from || ''),
        to: customerStageLabel(a.metadata?.to || ''),
      });
    }
    const label = t(`customers.record.act.${a.type}`, { defaultValue: a.type });
    if (a.type !== 'REMINDER' || !isReminderKind(a.reminderKind)) return label;
    return `${label} · ${t(REMINDER_KIND_KEYS[a.reminderKind])}`;
  }, [t]);

  /**
   * How a reminder fires, when it has anything unusual to say.
   *
   * Only what differs from the default is shown: "at the time" and "does not
   * repeat" are what a reminder is unless it says otherwise, and printing them
   * on every row would bury the ones that matter.
   */
  const tagsFor = useCallback((a: PendingActivity): ActivityTag[] | undefined => {
    if (a.type !== 'REMINDER') return undefined;
    const tags: ActivityTag[] = [];
    if (a.remindBeforeMin) tags.push({ label: t(reminderLeadKey(a.remindBeforeMin)) });
    if (a.repeat && a.repeat !== 'NONE') tags.push({ label: t(reminderRepeatKey(a.repeat)) });
    return tags.length ? tags : undefined;
  }, [t]);

  /**
   * One entry, drawn the same way on both lists.
   *
   * ⚠️ `onToggleDone` is the stable `toggleDone`, never an arrow written here:
   * `ActivityRow` is memoised, and a fresh function per render would make every
   * comparison fail and the memo pure decoration. `headingFor` and `tagsFor`
   * are `useCallback`ed for the same reason.
   */
  const addActivity = useCallback(async (input: ComposedActivity): Promise<boolean> => {
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
        { lane: clientLane(id), params: { customerId: id }, body: input, dependsOn: dependsOnClients(operations, id) },
        () => customersApi.addActivity(id, input),
      );
      if (outcome.kind === 'refused') return false;
      if (outcome.kind === 'done') await refreshActivities();
      return true;
    } catch {
      // The outbox reports its own failures; the draft stays so it is not lost.
      return false;
    }
  }, [activityCreate, id, operations, refreshActivities]);

  /**
   * ONE way to change this client, whatever moved it — the stage pills, the
   * language chips, the edit sheet.
   *
   * They are one PATCH on the server and one queued operation here, so they
   * share one function: three copies of "queue it, roll back on a refusal,
   * commit it on acceptance" is three places for those three cases to drift.
   *
   * ⚠️ Nothing is written to `customer` while it is only QUEUED. The record on
   * screen is `record`, which reads the outbox — so the change survives leaving
   * the screen, and a refusal takes it away by itself. What IS written here is
   * the accepted value: once the operation is done its overlay has gone, and
   * without this the screen would snap back to the value the server gave us
   * when the record was loaded.
   */
  const patchClient = useCallback(async (patch: Partial<MobileCustomer>, failed: string): Promise<boolean> => {
    const outcome = await write.run(
      (e) => updateClientFromPhone(e, { customerId: id, patch: patch as Record<string, unknown> }),
      () => customersApi.update(id, patch),
    );
    if (outcome.kind === 'refused') {
      toast.error(outcome.message || failed);
      return false;
    }
    if (outcome.kind === 'done') setCustomer((c) => (c ? { ...c, ...patch } : c));
    return true;
  }, [id, write, toast]);

  const setStage = useCallback(async (next: string) => {
    if (!record || !canWork || next === (record.status || 'LEAD')) return;
    // A stage is the member's own reading of where the deal stands, so a replay
    // overwriting somebody else's later reading is the right answer — it IS the
    // latest word from the person doing the selling.
    if (await patchClient({ status: next }, t('customers.record.stageFailed'))) await refreshActivities();
  }, [record, canWork, patchClient, refreshActivities, t]);

  /*
    Change the client's language for emails. A refusal takes the new value off
    the record AND says so — a language that silently reverted would be
    discovered when the next invitation arrives in English.
  */
  const setLocale = useCallback(async (value: string) => {
    if (!record) return;
    const locale = clientLocalePayload(value);
    setLocaleOpen(false);
    if (locale === (record.locale ?? null)) return;
    await patchClient({ locale }, t('customers.localeFailed'));
  }, [record, patchClient, t]);

  const openRecord = useCallback((customerId: string) => {
    // `push`, not `replace`: walking from a company to a contact and back is
    // the normal motion here, and replace would strip the way back.
    router.push(`/(app)/customer/${customerId}` as never);
  }, []);

  /*
    Only offered on a link the server has minted — see `pendingContactLinks`.
    Which is why `companyId` is this record: the star appears on the "Contact
    people" card only, where this record IS the company.
  */
  const makePrimary = useCallback(async (link: MobileCustomerContact) => {
    setBusyLink(link.id);
    const outcome = await write.run(
      (e) => updateContactFromPhone(e, { linkId: link.id, companyId: id, isPrimary: true }),
      () => customersApi.updateContact(link.id, { isPrimary: true }),
    );
    setBusyLink(null);
    if (outcome.kind === 'refused') {
      toast.error(outcome.message || t('customers.record.contactFailed'));
      return;
    }
    // Only one primary per company, so the others must drop locally too — the
    // server enforces it and a refetch would agree, at the cost of a round trip
    // the person is watching. (While queued, `applyPendingContacts` says it.)
    if (outcome.kind === 'done') setContacts((list) => list.map((x) => ({ ...x, isPrimary: x.id === link.id })));
  }, [id, write, t, toast]);

  const confirmRemove = useCallback(async () => {
    const link = removing;
    if (!link) return;
    setRemoving(null);
    /*
      ⚠️ A row that has never been sent is CANCELLED, not deleted. There is no
      link id for the server to act on — `addContact` mints one and accepts no
      client-supplied id — so the only honest meaning of "remove" here is
      "forget the attachment I made in the basement".
    */
    if (link.opId) {
      if (write.engine && !(await discardPendingContact(write.engine, link.opId))) {
        // Already on its way — it may have landed on an answer that was lost, so
        // the only honest thing is to wait for it and detach the real link.
        toast.error(t('customers.record.contactSending'));
      }
      return;
    }
    setBusyLink(link.id);
    // From the "Works at" card this record is the PERSON and the company is the
    // far end; from "Contact people" it is the other way round.
    const companyId = link.company?.id ?? id;
    const outcome = await write.run(
      (e) => removeContactFromPhone(e, { linkId: link.id, companyId }),
      () => customersApi.removeContact(link.id),
    );
    setBusyLink(null);
    if (outcome.kind === 'refused') {
      toast.error(outcome.message || t('customers.record.contactFailed'));
      return;
    }
    // Detaching keeps the PERSON — the link is what goes. Both panels are
    // filtered because either could be showing this link.
    if (outcome.kind === 'done') {
      setContacts((list) => list.filter((x) => x.id !== link.id));
      setCompanies((list) => list.filter((x) => x.id !== link.id));
    }
  }, [removing, id, write, t, toast]);

  /** The same words the Sync screen and every other queued thing use. */
  return {
    record, loading, refreshing, onRefresh, refreshActivities, refreshContacts, refreshCompanies, setCustomer,
    tab, seen, selectTab,
    canEditInfo, canWork, assignees,
    shownContacts, shownCompanies, addresses, feed, filter, setFilter,
    openReminders, doneReminders, overdueCount, reminderRows, showDone, setShowDone,
    editing, setEditing, adding, setAdding, removing, setRemoving, busyLink, localeOpen, setLocaleOpen,
    openTask, toggleDone, addActivity, setStage, setLocale, openRecord, makePrimary, confirmRemove,
    headingFor, tagsFor, relTime,
  };
}

export type ClientRecordModel = ReturnType<typeof useClientRecord>;
