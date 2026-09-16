import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Linking, RefreshControl, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, Skeleton, PressableScale, ConfirmSheet, ChipRow, FilterChip, SegmentedTabs, type SegmentedTab } from '../../../src/components';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, type MobileCustomer, type MobileCustomerActivity } from '../../../src/lib/api';
// Straight from the module: `src/lib/api/index.ts` re-exports the customer API
// and its first two types but not the contact/address ones, and that barrel is
// not this change's to edit.
import type { MobileCustomerContact, MobileCustomerAddress } from '../../../src/lib/api/customers';
import {
  CUSTOMER_STAGES,
  customerStageLabel,
  isCompany,
  COMPANY_ONLY_FIELDS,
  COMPANY_FIELD_KEYS,
  type CompanyOnlyField,
} from '@hbcfield/shared/client';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS, type ThemeColors } from '../../../src/lib/constants';
import { useQueuedCreate } from '../../../src/offline/actions/queued-create';
import { CLIENT_LOCALE_OPTIONS, canEditClientLocale, clientLocaleFormValue, clientLocaleName, clientLocalePayload } from '../../../src/lib/client-locale';
import { useToast } from '../../../src/contexts/toast-context';
import { RecordCard, CardAction, RecordRow } from '../../../src/components/customer/record-card';
import { ClientAvatar } from '../../../src/components/customer/client-avatar';
import { ContactRow } from '../../../src/components/customer/contact-row';
import { AddressRow } from '../../../src/components/customer/address-row';
import { ActivityRow, type PendingActivity } from '../../../src/components/customer/activity-row';
import { ActivityComposer, type ComposedActivity } from '../../../src/components/customer/activity-composer';
import { ChoiceChip } from '../../../src/components/customer/client-fields';
import { ClientEditSheet } from '../../../src/components/customer/client-edit-sheet';
import { AddContactSheet } from '../../../src/components/customer/add-contact-sheet';

/*
  THE CLIENT RECORD — three tabs.

  It used to be one unstructured scroll — identity, stage pills, language,
  composer, timeline — with nowhere to put anything else. Cards gave it a
  shape; what they could not give it was a LENGTH. Everything was still one
  `ScrollView`, so opening a client with two hundred logged calls mounted two
  hundred rows before a single one of them was looked at, under a hero the
  member had already read.

  Three tabs, because there are three different jobs here:

    INFORMATION   who they are, where we stand, who to ask for, where to go
    ACTIVITY      what has happened — the composer and the whole feed
    REMINDERS     what has NOT happened yet, and what is late

  ⚠️ NOT "Notes" as the third tab. A note IS an activity — `CustomerActivity`
  is one table whose `type` is NOTE | CALL | EMAIL | MEETING | REMINDER |
  STATUS | SYSTEM — so a Notes tab is a subset of Activity, and it raises a
  question with no good answer: where does a logged CALL go? Notes is a filter
  chip inside Activity, next to Calls. Reminders earns its tab by being a
  different job entirely: outstanding work rather than history, and the one
  thing on this screen a field member must not walk past.
*/

const STAGE_DOT: Record<string, string> = {
  LEAD: '#94a3b8',
  CONTACTED: '#3b82f6',
  QUALIFIED: '#8b5cf6',
  CUSTOMER: '#16a34a',
  INACTIVE: '#9ca3af',
};

const TABS = ['information', 'activity', 'reminders'] as const;
type RecordTab = (typeof TABS)[number];
const isTab = (v: unknown): v is RecordTab => typeof v === 'string' && (TABS as readonly string[]).includes(v);

/** What the Activity feed is narrowed to. A note and a call are the two kinds a member files. */
const FILTERS = [
  { key: 'all', label: 'customers.record.filter.all', types: null },
  { key: 'notes', label: 'customers.record.filter.notes', types: ['NOTE'] },
  { key: 'calls', label: 'customers.record.filter.calls', types: ['CALL'] },
] as const;
type ActivityFilter = (typeof FILTERS)[number]['key'];

const isOverdue = (a: MobileCustomerActivity, now: number) =>
  a.type === 'REMINDER' && !!a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now;

/** Soonest first, so whatever is most overdue is the first thing on the tab. */
function byDue(a: MobileCustomerActivity, b: MobileCustomerActivity): number {
  const av = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bv = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  return av - bv;
}

export default function CustomerRecordScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string | string[] }>();
  const id = params.id;
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();
  const toast = useToast();

  const [customer, setCustomer] = useState<MobileCustomer | null>(null);
  const [activities, setActivities] = useState<MobileCustomerActivity[]>([]);
  const [contacts, setContacts] = useState<MobileCustomerContact[]>([]);
  const [companies, setCompanies] = useState<MobileCustomerContact[]>([]);
  const [addresses, setAddresses] = useState<MobileCustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [localeOpen, setLocaleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [busyLink, setBusyLink] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MobileCustomerContact | null>(null);
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
  const linkedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
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
  const activityCreate = useQueuedCreate<{ type: string; body?: string; dueAt?: string }>(
    'customer.activity',
    { onAccepted: () => void loadRef.current?.() },
  );

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
        createdAt: new Date(p.createdAt).toISOString(),
        pendingSync: true,
      }) as unknown as PendingActivity);
    return [...onPhone, ...activities];
  }, [activities, activityCreate.pending, id]);

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

  const tabs = useMemo<SegmentedTab<RecordTab>[]>(() => [
    { key: 'information', label: t('customers.record.tabs.information') },
    { key: 'activity', label: t('customers.record.tabs.activity') },
    {
      key: 'reminders',
      label: t('customers.record.tabs.reminders'),
      count: openReminders.length,
      // Red is the whole reason reminders are a tab: the one signal that has to
      // reach somebody who is standing on the Information tab reading a phone number.
      alert: overdueCount > 0,
      a11yLabel: overdueCount > 0
        ? t('customers.record.reminders.a11yOverdue', { count: overdueCount })
        : openReminders.length > 0
          ? t('customers.record.reminders.a11yOpen', { count: openReminders.length })
          : t('customers.record.tabs.reminders'),
    },
  ], [t, openReminders.length, overdueCount]);

  /*
    ABILITIES, read off the record itself.

    `crmCaps` comes back from the single-client read and answers for THIS
    record — a sales rep holds `editInfo` on their own clients and not on
    somebody else's, so it cannot be answered from the session.

    ⚠️ `work` was fetched and never consulted. The stage control was shown to
    everybody and the tap simply 403'd, which reads as a broken app rather than
    as a missing ability. The value still shows; only the ability is hidden.
  */
  const canEditInfo = customer?.crmCaps?.editInfo === true;
  const canWork = customer?.crmCaps?.work === true;

  const relTime = useCallback((iso: string) => {
    const secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (secs < 60) return t('customers.record.justNow');
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, [t]);

  const toggleDone = useCallback(async (a: MobileCustomerActivity) => {
    // Flip it here and now; the server's copy arrives with the refresh below.
    setActivities((list) => list.map((x) => (x.id === a.id ? { ...x, doneAt: a.doneAt ? null : new Date().toISOString() } : x)));
    try {
      await customersApi.updateActivity(id, a.id, { done: !a.doneAt });
      await refreshActivities();
    } catch {
      await refreshActivities();
    }
  }, [id, refreshActivities]);

  /**
   * One entry, drawn the same way on both lists.
   *
   * ⚠️ `onToggleDone` is the stable `toggleDone`, never an arrow written here:
   * `ActivityRow` is memoised, and a fresh function per render would make every
   * comparison fail and the memo pure decoration.
   */
  const renderActivity = useCallback((a: PendingActivity, continues: boolean) => (
    <ActivityRow
      activity={a}
      continues={continues}
      heading={
        a.type === 'STATUS'
          ? t('customers.record.stageChanged', {
              from: customerStageLabel(a.metadata?.from || ''),
              to: customerStageLabel(a.metadata?.to || ''),
            })
          : t(`customers.record.act.${a.type}`, { defaultValue: a.type })
      }
      meta={[
        a.author ? a.author.firstName : '',
        a.pendingSync ? t('offline.chip.waiting') : relTime(a.createdAt),
      ].filter(Boolean).join(' · ')}
      // A queued entry has no server row to mark done yet.
      onToggleDone={a.pendingSync ? undefined : toggleDone}
      doneLabel={
        a.type !== 'REMINDER' ? undefined
          : a.doneAt ? t('customers.record.reminderDone')
          : a.dueAt ? t('customers.record.reminderDue', { date: new Date(a.dueAt).toLocaleDateString() })
          : t('customers.record.composer.reminder')
      }
    />
  ), [t, relTime, toggleDone]);

  const keyOfActivity = useCallback((a: PendingActivity) => a.id, []);

  const renderFeedItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PendingActivity>) => renderActivity(item, index < feed.length - 1),
    [renderActivity, feed.length],
  );

  const renderReminderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PendingActivity>) => (
      <>
        {/* The boundary between what is still owed and what is finished. Drawn
            from the index rather than by tagging the rows, so both lists keep
            one plain array of activities and one key extractor. */}
        {showDone && index === openReminders.length && index > 0 && (
          <Text style={s.sectionLabel}>{t('customers.record.reminders.done')}</Text>
        )}
        {renderActivity(item, index < reminderRows.length - 1)}
      </>
    ),
    [renderActivity, showDone, openReminders.length, reminderRows.length, s, t],
  );

  const addActivity = useCallback(async (input: ComposedActivity): Promise<boolean> => {
    try {
      const outcome = await activityCreate.run(
        { lane: `crm:${id}`, params: { customerId: id }, body: input },
        () => customersApi.addActivity(id, input),
      );
      if (outcome.kind === 'refused') return false;
      if (outcome.kind === 'done') await refreshActivities();
      return true;
    } catch {
      // The outbox reports its own failures; the draft stays so it is not lost.
      return false;
    }
  }, [activityCreate, id, refreshActivities]);

  /*
    Stage, language and reminder-done are optimistic and go DIRECT.

    None of the three is in `SYNC_OPERATIONS`, so there is no queued route to
    route them through — the outbox only replays operations the allow-list
    names. With no signal they are lost, exactly as they were before this
    rewrite; making them durable means adding rows to that list, which is a
    server-side change and not this screen's to make.
  */
  const setStage = async (next: string) => {
    if (!customer || !canWork || next === customer.status) return;
    const before = customer.status;
    setCustomer({ ...customer, status: next });
    try {
      await customersApi.update(id, { status: next });
      await refreshActivities();
    } catch (e: unknown) {
      setCustomer((c) => (c ? { ...c, status: before } : c));
      toast.error((e as { message?: string })?.message || t('customers.record.stageFailed'));
    }
  };

  /*
    Change the client's language for emails. Optimistic like the stage, but a
    refusal puts the old value back and SAYS so — a language that silently
    reverted would be discovered when the next invitation arrives in English.
  */
  const setLocale = async (value: string) => {
    if (!customer) return;
    const before = customer.locale ?? null;
    const locale = clientLocalePayload(value);
    setLocaleOpen(false);
    if (locale === before) return;
    setCustomer({ ...customer, locale });
    try {
      await customersApi.update(id, { locale });
    } catch (e: unknown) {
      setCustomer((c) => (c ? { ...c, locale: before } : c));
      toast.error((e as { message?: string })?.message || t('customers.localeFailed'));
    }
  };

  const openRecord = useCallback((customerId: string) => {
    // `push`, not `replace`: walking from a company to a contact and back is
    // the normal motion here, and replace would strip the way back.
    router.push(`/(app)/customer/${customerId}` as never);
  }, []);

  const makePrimary = useCallback(async (link: MobileCustomerContact) => {
    setBusyLink(link.id);
    try {
      await customersApi.updateContact(link.id, { isPrimary: true });
      // Only one primary per company, so the others must drop locally too —
      // the server enforces it and a refetch would agree, at the cost of a
      // round trip the person is watching.
      setContacts((list) => list.map((x) => ({ ...x, isPrimary: x.id === link.id })));
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || t('customers.record.contactFailed'));
    } finally { setBusyLink(null); }
  }, [t, toast]);

  const confirmRemove = useCallback(async () => {
    const link = removing;
    if (!link) return;
    setRemoving(null);
    setBusyLink(link.id);
    try {
      await customersApi.removeContact(link.id);
      // Detaching keeps the PERSON — the link is what goes. Both panels are
      // filtered because either could be showing this link.
      setContacts((list) => list.filter((x) => x.id !== link.id));
      setCompanies((list) => list.filter((x) => x.id !== link.id));
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || t('customers.record.contactFailed'));
    } finally { setBusyLink(null); }
  }, [removing, t, toast]);

  const rowLabels = useMemo(() => ({
    primary: t('customers.record.primary'),
    makePrimary: t('customers.record.makePrimary'),
    remove: t('customers.record.removeContact'),
    call: t('customers.record.call'),
    email: t('customers.record.email'),
  }), [t]);

  const addressLabels = useMemo(() => ({
    primary: t('customers.record.primary'),
    navigate: t('customers.record.navigate'),
    call: t('customers.record.call'),
  }), [t]);

  const refresher = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
  );

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title="" />
        <View style={s.scroll}>
          <View style={s.hero}>
            <Skeleton.Square size={52} radius={16} />
            <View style={{ flex: 1 }}>
              <Skeleton.Line width="60%" height={18} />
              <Skeleton.Line width="35%" height={12} style={{ marginTop: 8 }} />
            </View>
          </View>
          <Skeleton.Card height={96} />
          <Skeleton.Card height={128} />
          <Skeleton.Card height={128} />
        </View>
      </SafeAreaView>
    );
  }

  if (!customer) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
        <ScreenHeader title="" />
        <View style={s.notFound}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          <Text style={s.notFoundText}>{t('customers.record.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const company = isCompany(customer);
  const status = customer.status || 'LEAD';
  const filledCompanyFields = COMPANY_ONLY_FIELDS
    .map((f) => [f, (customer[f as CompanyOnlyField] as string | null | undefined)?.trim()] as const)
    .filter(([, v]) => !!v);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScreenHeader
        title={customer.name}
        right={canEditInfo ? (
          <CardAction icon="create-outline" label={t('customers.record.edit')} onPress={() => setEditing(true)} />
        ) : undefined}
      />

      <SegmentedTabs tabs={tabs} active={tab} onChange={selectTab} style={s.tabBar} />

      {/* ================= INFORMATION ================= */}
      {seen.information && (
        <View style={[s.pane, tab !== 'information' && s.hidden]}>
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={refresher}
          >
            {/* ---- Hero: who is this ---- */}
            <View style={s.hero}>
              <ClientAvatar customer={customer} size={56} />
              <View style={s.heroText}>
                <Text style={s.heroName} numberOfLines={2}>{customer.name}</Text>
                <View style={s.heroTags}>
                  <View style={s.kindPill}>
                    <Ionicons name={company ? 'business' : 'person'} size={11} color={colors.textSecondary} />
                    <Text style={s.kindText}>
                      {t(company ? 'customers.record.kindCompany' : 'customers.record.kindPerson')}
                    </Text>
                  </View>
                  {!!customer.industry?.trim() && <Text style={s.industry} numberOfLines={1}>{customer.industry.trim()}</Text>}
                </View>
                {customer.isPortalResident && (
                  <Text style={s.appAccess}>{t('customers.appAccess')}</Text>
                )}
              </View>
              <View style={s.heroActions}>
                {!!customer.phone && (
                  <HeroButton icon="call" label={t('customers.record.call')} onPress={() => void Linking.openURL(`tel:${customer.phone}`)} />
                )}
                {!!customer.email && (
                  <HeroButton icon="mail" label={t('customers.record.email')} onPress={() => void Linking.openURL(`mailto:${customer.email}`)} />
                )}
              </View>
            </View>

            {/* ---- Stage ---- */}
            <RecordCard title={t('customers.record.stage')} icon="flag-outline">
              {canWork ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                  {CUSTOMER_STAGES.map((stage) => (
                    <ChoiceChip
                      key={stage.key}
                      label={customerStageLabel(stage.key)}
                      selected={status === stage.key}
                      dotColor={STAGE_DOT[stage.key]}
                      onPress={() => void setStage(stage.key)}
                    />
                  ))}
                </ScrollView>
              ) : (
                /*
                  No ability to move it, so no pills — but the stage is a FACT about
                  the client and stays visible. Hiding the value with the control
                  would answer "where are we with them" with silence.
                */
                <View style={s.chips}>
                  <ChoiceChip label={customerStageLabel(status)} selected dotColor={STAGE_DOT[status]} onPress={() => {}} disabled />
                </View>
              )}
            </RecordCard>

            {/*
              ---- Contact people (a company) ----

              A card earns its place by holding something or by offering something.
              With no contacts AND no ability to add one it does neither, so it goes
              — a reader who cannot act on an empty panel learns only that the
              screen is long.
            */}
            {(contacts.length > 0 || (company && canEditInfo)) && (
              <RecordCard
                title={t('customers.record.contacts')}
                icon="people-outline"
                badge={contacts.length || undefined}
                action={canEditInfo ? (
                  <CardAction icon="add" label={t('customers.record.addContact')} onPress={() => setAddingContact(true)} />
                ) : undefined}
                empty={contacts.length === 0 ? t('customers.record.noContacts') : undefined}
              >
                {contacts.length > 0 ? contacts.map((link) => (
                  <ContactRow
                    key={link.id}
                    link={link}
                    side="person"
                    onOpen={openRecord}
                    onTogglePrimary={canEditInfo ? makePrimary : undefined}
                    onRemove={canEditInfo ? setRemoving : undefined}
                    labels={rowLabels}
                    busy={busyLink === link.id}
                  />
                )) : undefined}
              </RecordCard>
            )}

            {/*
              ---- Works at (a person) ----

              Shown when there is something to show, or when the record IS a contact
              person — for whom "which firms do I contact for" is the whole point of
              the record. An ordinary individual client gets nothing: the link is
              only ever created from the COMPANY end, so an empty card here would
              carry no action and no information, on every person in the book.
            */}
            {(companies.length > 0 || customer.isContact === true) && (
              <RecordCard
                title={t('customers.record.worksAt')}
                icon="business-outline"
                badge={companies.length || undefined}
                empty={companies.length === 0 ? t('customers.record.noCompanies') : undefined}
              >
                {companies.length > 0 ? companies.map((link) => (
                  <ContactRow
                    key={link.id}
                    link={link}
                    side="company"
                    onOpen={openRecord}
                    onRemove={canEditInfo ? setRemoving : undefined}
                    labels={rowLabels}
                    busy={busyLink === link.id}
                  />
                )) : undefined}
              </RecordCard>
            )}

            {/*
              ---- Addresses (read only — see AddressRow) ----

              Only when there are any. Most clients in a real book carry their
              address on the RECORD and have no address rows at all, so an
              always-present card with no add button would read "No addresses yet."
              on the majority of clients and mean nothing on any of them.
            */}
            {addresses.length > 0 && (
              <RecordCard
                title={t('customers.record.addresses')}
                icon="location-outline"
                badge={addresses.length}
              >
                {addresses.map((a) => <AddressRow key={a.id} address={a} labels={addressLabels} />)}
              </RecordCard>
            )}

            {/* ---- Details: the company block, and the language for emails ---- */}
            <RecordCard title={t(company ? 'customers.record.details' : 'customers.record.detailsPerson')} icon="information-circle-outline">
              {company && filledCompanyFields.map(([field, value]) => (
                <RecordRow
                  key={field}
                  // The shared key first; this screen's own is what renders until
                  // the catalogue gains the shared one. COMPANY_ONLY_FIELDS is the
                  // part that must be shared — a field added there has to show up
                  // on the record AND the form.
                  label={t(COMPANY_FIELD_KEYS[field], { defaultValue: t(`customers.form.${field}`) })}
                  value={value as string}
                />
              ))}
              {!!customer.contactName?.trim() && <RecordRow label={t('customers.fContact')} value={customer.contactName.trim()} />}
              {!!customer.notes?.trim() && <RecordRow label={t('customers.form.notes')} value={customer.notes.trim()} />}

              {/*
                Language for emails. Always shown — "same as the organization" still
                decides something, and the person on the phone should see what. Only
                somebody who may edit this client's info can change it.
              */}
              <PressableScale
                disabled={!canEditClientLocale(customer)}
                onPress={() => setLocaleOpen((o) => !o)}
                accessibilityRole={canEditClientLocale(customer) ? 'button' : 'text'}
                accessibilityState={{ expanded: localeOpen }}
                style={s.localeRow}
              >
                <Ionicons name="language" size={16} color={colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.localeLabel}>{t('customers.locale')}</Text>
                  <Text style={s.localeValue}>
                    {clientLocaleName(customer.locale) ?? t('customers.localeSame')}
                  </Text>
                </View>
                {canEditClientLocale(customer) && (
                  <Ionicons name={localeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                )}
              </PressableScale>
              {localeOpen && canEditClientLocale(customer) && (
                <View style={s.chipsWrap}>
                  {[{ value: '', label: t('customers.localeSame') }, ...CLIENT_LOCALE_OPTIONS].map((o) => (
                    <ChoiceChip
                      key={o.value || 'same'}
                      label={o.label}
                      selected={clientLocaleFormValue(customer) === o.value}
                      onPress={() => void setLocale(o.value)}
                    />
                  ))}
                </View>
              )}
            </RecordCard>

            <View style={{ height: SPACING.xxl }} />
          </ScrollView>
        </View>
      )}

      {/* ================= ACTIVITY ================= */}
      {seen.activity && (
        <View style={[s.pane, tab !== 'activity' && s.hidden]}>
          {/*
            ⚠️ A `FlatList`, not the `ScrollView` this all used to live in. A
            client with two hundred logged calls mounted two hundred rows the
            moment the record opened; now it mounts the handful on screen. This
            is the larger half of what the tabs bought — bigger than the tabs.

            ⚠️ `ListHeaderComponent` is given an ELEMENT, and the composer is a
            module-scope component. A function component declared inside this
            render would be a new type every pass, React would remount the
            header, and the note being typed would lose focus after each letter.
          */}
          <FlatList
            data={feed}
            keyExtractor={keyOfActivity}
            renderItem={renderFeedItem}
            contentContainerStyle={s.listPad}
            keyboardShouldPersistTaps="handled"
            refreshControl={refresher}
            // ⚠️ Off deliberately: the pane it lives in is hidden with
            // `display: 'none'` while another tab is showing, and clipped
            // subviews inside a hidden parent are the classic way rows come
            // back blank when it is shown again.
            removeClippedSubviews={false}
            ListHeaderComponent={
              <View>
                <ActivityComposer onSubmit={addActivity} />
                <ChipRow fadeColor={colors.surface} style={s.filterBar}>
                  {FILTERS.map((f) => (
                    <FilterChip
                      key={f.key}
                      label={t(f.label)}
                      active={filter === f.key}
                      onPress={() => setFilter(f.key)}
                    />
                  ))}
                </ChipRow>
              </View>
            }
            ListEmptyComponent={
              <Text style={s.empty}>
                {filter === 'all'
                  ? t('customers.record.noActivity')
                  : t('customers.record.noActivityFiltered')}
              </Text>
            }
            ListFooterComponent={<View style={{ height: SPACING.xxl }} />}
          />
        </View>
      )}

      {/* ================= REMINDERS ================= */}
      {seen.reminders && (
        <View style={[s.pane, tab !== 'reminders' && s.hidden]}>
          <FlatList
            data={reminderRows}
            keyExtractor={keyOfActivity}
            renderItem={renderReminderItem}
            contentContainerStyle={s.listPad}
            refreshControl={refresher}
            // ⚠️ Off deliberately: the pane it lives in is hidden with
            // `display: 'none'` while another tab is showing, and clipped
            // subviews inside a hidden parent are the classic way rows come
            // back blank when it is shown again.
            removeClippedSubviews={false}
            ListHeaderComponent={
              <View>
                {overdueCount > 0 && (
                  <View style={s.overdue}>
                    <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                    <Text style={s.overdueText}>
                      {t('customers.record.reminders.overdue', { count: overdueCount })}
                    </Text>
                  </View>
                )}
                {doneReminders.length > 0 && (
                  <PressableScale
                    onPress={() => setShowDone((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showDone }}
                    style={s.doneToggle}
                  >
                    <Ionicons
                      name={showDone ? 'eye-off-outline' : 'eye-outline'}
                      size={15}
                      color={colors.textMuted}
                    />
                    <Text style={s.doneToggleText}>
                      {showDone
                        ? t('customers.record.reminders.hideDone')
                        : t('customers.record.reminders.showDone', { count: doneReminders.length })}
                    </Text>
                  </PressableScale>
                )}
                <View style={{ height: SPACING.md }} />
              </View>
            }
            ListEmptyComponent={<Text style={s.empty}>{t('customers.record.reminders.none')}</Text>}
            ListFooterComponent={<View style={{ height: SPACING.xxl }} />}
          />
        </View>
      )}

      {canEditInfo && (
        <ClientEditSheet
          visible={editing}
          customer={customer}
          onClose={() => setEditing(false)}
          // The save returns the record; adopting it costs no extra read, and
          // the timeline is refreshed because an edit writes its own entry.
          onSaved={(saved) => { setCustomer(saved); void refreshActivities(); }}
        />
      )}
      {canEditInfo && (
        <AddContactSheet
          visible={addingContact}
          companyId={id}
          onClose={() => setAddingContact(false)}
          onAdded={(link) => setContacts((list) => [...list, link])}
        />
      )}
      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={t('customers.record.removeContact')}
        // Says what it does NOT do: detaching keeps the person's own record.
        message={t('customers.record.removeContactBody', { name: removing?.person?.name ?? removing?.company?.name ?? '' })}
        confirmLabel={t('customers.record.removeContactConfirm')}
        variant="danger"
      />
    </SafeAreaView>
  );
}

function HeroButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <PressableScale onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={s.heroBtn}>
      <Ionicons name={icon} size={19} color={COLORS.primary} />
    </PressableScale>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1 },
    tabBar: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm },
    /*
      A pane fills what is left under the tab bar. `display: 'none'` rather
      than unmounting: the component tree, its state and the native scroll
      offset all survive the switch, so coming back to Activity lands where the
      member left it. A hidden pane is not laid out and not drawn.
    */
    pane: { flex: 1 },
    hidden: { display: 'none' },
    scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
    listPad: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, flexGrow: 1 },
    // Full bleed, so the scroll fades sit on the screen edge rather than 16px
    // inside it, where they would read as a line under the composer.
    filterBar: { marginHorizontal: -SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.sm },
    empty: {
      fontSize: FONT_SIZE.base,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: SPACING.xxl,
    },
    sectionLabel: {
      fontSize: FONT_SIZE.xs,
      fontWeight: FONT_WEIGHT.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: SPACING.md,
      marginBottom: SPACING.md,
    },
    overdue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: c.errorLight,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      marginTop: SPACING.md,
    },
    overdueText: { flex: 1, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: COLORS.error },
    doneToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      alignSelf: 'flex-start',
      marginTop: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    doneToggleText: { fontSize: FONT_SIZE.sm, color: c.textMuted, fontWeight: FONT_WEIGHT.medium },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.lg,
    },
    heroText: { flex: 1, minWidth: 0 },
    heroName: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: c.textPrimary },
    heroTags: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs, flexWrap: 'wrap' },
    kindPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
    },
    kindText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, color: c.textSecondary },
    industry: { fontSize: FONT_SIZE.sm, color: c.textMuted, flexShrink: 1 },
    appAccess: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: COLORS.success, marginTop: SPACING.xs },
    heroActions: { flexDirection: 'row', gap: SPACING.sm },
    heroBtn: {
      width: 42,
      height: 42,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primaryLight,
      ...SHADOWS.sm,
    },
    chips: { flexDirection: 'row', gap: SPACING.sm, paddingRight: SPACING.lg },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    localeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingTop: SPACING.md,
      marginTop: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    localeLabel: { fontSize: FONT_SIZE.sm, color: c.textMuted },
    localeValue: { fontSize: FONT_SIZE.lg, color: c.textPrimary, fontWeight: FONT_WEIGHT.medium, marginTop: 1 },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingBottom: 80 },
    notFoundText: { fontSize: FONT_SIZE.xl, color: c.textMuted },
  });
