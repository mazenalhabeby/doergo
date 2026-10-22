import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { customersApi, type MobileCustomer, type MobileCustomerActivity } from '../../../lib/api';
import type { MobileCustomerContact, MobileCustomerAddress } from '../../../lib/api/customers';
import { useQueuedCreate } from '../../../offline/actions/queued-create';
import { useQueuedWrite } from '../../../offline/actions/queued-write';
import { useSyncStatus } from '../../../offline/offline-context';
import { applyPendingClient, pendingActivityDone } from '../../../offline/crm/client-overlay';
import { useToast } from '../../../island/island-context';
import type { ComposedActivity } from '../activity-composer';
import { useAuth } from '../../../contexts/auth-context';
import type { ContactSide } from '../add-contact-sheet';
import { type RecordTab, isTab, type ActivityFilter } from './client-record-helpers';

/** useClientRecordData's state and handlers — everything before its markup, moved here unchanged. */
export function useClientRecordState(id: string, linkedTab: string | undefined) {
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
  const activityCreate = useQueuedCreate<ComposedActivity>('customer.activity', {
    onAccepted: () => void loadRef.current?.(),
  });

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
    try {
      setActivities(await customersApi.activities(id));
    } catch {
      /* the timeline simply lags */
    }
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
    try {
      setCompanies(await customersApi.companies(id));
    } catch {
      /* the panel simply lags */
    }
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
    try {
      setContacts(await customersApi.contacts(id));
    } catch {
      /* the panel simply lags */
    }
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

  useEffect(() => {
    void load();
  }, [load]);
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

  return {
    t,
    toast,
    user,
    setCustomer,
    activities,
    setActivities,
    contacts,
    setContacts,
    companies,
    setCompanies,
    addresses,
    loading,
    refreshing,
    localeOpen,
    setLocaleOpen,
    editing,
    setEditing,
    adding,
    setAdding,
    busyLink,
    setBusyLink,
    removing,
    setRemoving,
    filter,
    setFilter,
    showDone,
    setShowDone,
    tab,
    seen,
    selectTab,
    activityCreate,
    write,
    operations,
    refreshActivities,
    refreshCompanies,
    refreshContacts,
    onRefresh,
    record,
    doneOffline,
  };
}
