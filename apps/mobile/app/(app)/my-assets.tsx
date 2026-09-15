import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenHeader } from '../../src/components';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import {
  assetsApi, assetProposalsApi, type HeldAsset, type MyExpense, type MyProposal, type MyLogEntry, type DueItem,
} from '../../src/lib/api';
import { normalizeKindShape, custodyDays, logTypesForKind, COST_LOG_KEY } from '@hbcfield/shared/client';
import { logColor, logTypeLabel } from '../../src/lib/log-display';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { SendDocumentGlyph } from '../../src/components/home/glyphs';

/**
 * What I have been given, and what I have spent on it.
 *
 * There is no picker of the organization's equipment here and there must not
 * be: the list IS my custody, so a driver opens the app and sees their van
 * because it is theirs, not because they searched a register they cannot read.
 *
 * The expenses below are shown with what happened to them. An expense sent from
 * a pump and silently never mentioned again is how a member learns to stop
 * sending them — "waiting" and "refused, because…" are the states that keep the
 * habit.
 */

const euros = (cents: number) => `€${(Math.abs(cents) / 100).toFixed(2)}`;

export default function MyAssetsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [held, setHeld] = useState<HeldAsset[] | null>(null);
  const [expenses, setExpenses] = useState<MyExpense[]>([]);
  /*
    The logbook, when the server has it. Null means "this server does not
    answer the logbook routes" (an older deploy): the screen then shows the
    expenses list it always did, rather than an empty "My entries" that would
    read as everything having been lost.
  */
  const [entries, setEntries] = useState<MyLogEntry[] | null>(null);
  const [due, setDue] = useState<DueItem[]>([]);
  const [sent, setSent] = useState<MyProposal[]>([]);
  const [canPropose, setCanPropose] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      // Both at once: two independent reads, and waiting for the first to
      // finish before starting the second doubles the time on a phone.
      const [mine, sent, proposals, logged, dueSoon] = await Promise.all([
        assetsApi.mine(),
        assetsApi.myExpenses(),
        assetProposalsApi.mine(),
        // Allowed to fail alone: a logbook the server lacks must not empty the screen.
        assetsApi.myLog().catch(() => null),
        assetsApi.dueMine().catch(() => [] as DueItem[]),
      ]);
      setHeld(mine.periods);
      setCanPropose(mine.canPropose);
      setExpenses(sent);
      setSent(proposals);
      setEntries(logged);
      setDue(dueSoon);
    } catch (e: any) {
      toast.error(e?.message || t('myAssets.loadFailed', 'Could not load what you hold'));
      setHeld([]);
    } finally {
      setRefreshing(false);
    }
  }, [t, toast]);

  // Re-read on focus: coming back from filing an expense must show it.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={t('myAssets.title', 'My equipment')} />

      {held === null ? (
        <View style={s.centre}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />}
        >
          {/*
            Due soon, before the list of things: "the Sprinter's oil is overdue"
            is the one line on this screen that should change what somebody does
            today. The server puts overdue first.
          */}
          {due.length > 0 && (
            <View style={[s.dueBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>
                {t('logbook.dueSoon', 'Due soon')}
              </Text>
              {due.map((d) => <DueRow key={`${d.assetId}:${d.key}`} item={d} colors={colors} t={t} />)}
            </View>
          )}

          {held.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>
                {t('myAssets.empty', 'No equipment has been handed to you yet.')}
              </Text>
            </View>
          ) : (
            held.map((h) => <HeldCard key={h.id} held={h} colors={colors} t={t} />)
          )}

          {canPropose && (
            <TouchableOpacity
              style={[s.secondary, { borderColor: colors.border }]}
              onPress={() => router.push('/send-document')}
            >
              <SendDocumentGlyph size={19} color={COLORS.primary} />
              <Text style={[s.secondaryText, { color: COLORS.primary }]}>
                {t('sendDoc.title', 'Send a document')}
              </Text>
            </TouchableOpacity>
          )}

          {/*
            Pages sent in, and what happened to them. A proposal that is never
            mentioned again is how a member learns to stop sending them — so
            "waiting", "added" and "refused, because…" all show here.
          */}
          {sent.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: colors.textMuted }]}>
                {t('sendDoc.mine', 'Documents I sent in')}
              </Text>
              {sent.map((p) => <ProposalRow key={p.id} proposal={p} colors={colors} t={t} />)}
            </>
          )}

          {entries !== null ? (
            entries.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>
                  {t('logbook.mine', 'My entries')}
                </Text>
                {entries.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    colors={colors}
                    t={t}
                    onWithdraw={async () => {
                      try {
                        await assetsApi.withdrawLog(e.assetId, e.id);
                        toast.success(t('logbook.withdrawn', 'Taken back'));
                        void load();
                      } catch (err: any) {
                        toast.error(err?.message || t('logbook.withdrawFailed', 'Could not take it back'));
                      }
                    }}
                  />
                ))}
              </>
            )
          ) : (
            expenses.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>
                  {t('myAssets.sent', 'What I sent in')}
                </Text>
                {expenses.map((e) => <ExpenseRow key={e.id} expense={e} colors={colors} t={t} />)}
              </>
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HeldCard({ held, colors, t }: { held: HeldAsset; colors: any; t: any }) {
  const shape = normalizeKindShape(held.asset?.category?.config);
  const days = custodyDays(held as never);
  // Filing is only offered where the KIND tracks money and has somewhere to put
  // it. A button that opens a form with an empty required select is worse than
  // no button.
  const canSpend = shape.money.enabled && shape.money.categories.some((c) => c.direction === 'out');
  /*
    "What did you do?" — the kind's log types, Cost first where the kind has
    money to spend. Offered only when there is more than the receipt to choose
    from: a picker with one row is a button that takes two taps.
  */
  const types = logTypesForKind(shape).filter((ty) => ty.key !== COST_LOG_KEY || canSpend);
  const hasLog = shape.logTypes.length > 0;
  const [picking, setPicking] = useState(false);

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.cardHead}>
        <View style={[s.icon, { backgroundColor: `${held.asset?.category?.color ?? COLORS.primary}22` }]}>
          <Ionicons name="cube" size={20} color={held.asset?.category?.color ?? COLORS.primary} />
        </View>
        <View style={s.grow}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {held.asset?.name ?? t('myAssets.anAsset', 'An asset')}
          </Text>
          <Text style={[s.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
            {[held.asset?.category?.name, held.asset?.serialNumber].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
      </View>

      <View style={[s.metaRow, { borderTopColor: colors.border }]}>
        <View>
          <Text style={[s.metaLabel, { color: colors.textMuted }]}>{t('myAssets.since', 'Since')}</Text>
          <Text style={[s.metaValue, { color: colors.textPrimary }]}>
            {new Date(held.startedAt).toLocaleDateString()} · {t('custody.days', '{{count}} days', { count: days })}
          </Text>
        </View>
        <View style={s.right}>
          <Text style={[s.metaLabel, { color: colors.textMuted }]}>{t('myAssets.spent', 'Spent')}</Text>
          <Text style={[s.metaValue, { color: '#f59e0b' }]}>{euros(held.totals.outCents)}</Text>
        </View>
      </View>

      {hasLog ? (
        <>
          <TouchableOpacity
            style={[s.primary, { backgroundColor: COLORS.primary }]}
            onPress={() => setPicking((p) => !p)}
          >
            <Ionicons name={picking ? 'chevron-up' : 'add'} size={18} color="#fff" />
            <Text style={s.primaryText}>{t('logbook.whatDidYouDo', 'What did you do?')}</Text>
          </TouchableOpacity>
          {picking && (
            <View style={[s.picker, { borderColor: colors.border }]}>
              {types.map((ty, i) => (
                <TouchableOpacity
                  key={ty.key}
                  style={[s.pickRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  onPress={() => {
                    setPicking(false);
                    // The Cost log IS "Add a receipt" — its camera and PDF reader, unchanged.
                    if (ty.key === COST_LOG_KEY) router.push({ pathname: '/(app)/asset-expense', params: { assetId: held.assetId } });
                    else router.push({ pathname: '/(app)/asset-log', params: { assetId: held.assetId, logType: ty.key } });
                  }}
                >
                  <View style={[s.dot, { backgroundColor: logColor(ty.color) }]} />
                  <Text style={[s.pickText, { color: colors.textPrimary }]} numberOfLines={1}>{logTypeLabel(ty, t)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      ) : canSpend && (
        <TouchableOpacity
          style={[s.primary, { backgroundColor: COLORS.primary }]}
          onPress={() => router.push({ pathname: '/(app)/asset-expense', params: { assetId: held.assetId } })}
        >
          <Ionicons name="receipt-outline" size={17} color="#fff" />
          <Text style={s.primaryText}>{t('myAssets.addExpense', 'Add a receipt')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** "Sprinter · Oil change — 588 km overdue". Both limits are said while it is only soon. */
function DueRow({ item, colors, t }: { item: DueItem; colors: any; t: any }) {
  const overdue = item.stage === 'overdue';
  const units = item.unitsLeft;
  const days = item.daysLeft;
  const unit = item.unit ? ` ${item.unit}` : '';
  let when: string;
  if (overdue) {
    when = units !== null && units <= 0
      ? t('logbook.overdueUnits', '{{amount}} overdue', { amount: `${Math.abs(units).toLocaleString()}${unit}` })
      : days !== null
        ? t('logbook.overdueDays', '{{count}} days overdue', { count: Math.abs(days) })
        : t('logbook.overdue', 'Overdue');
  } else {
    // Whichever first: both limits, when the type has both.
    const parts = [
      days !== null ? t('logbook.inDays', 'in {{count}} days', { count: days }) : null,
      units !== null ? t('logbook.inUnits', 'in {{amount}}', { amount: `${units.toLocaleString()}${unit}` }) : null,
    ].filter(Boolean);
    when = parts.length ? parts.join(` ${t('logbook.or', 'or')} `) : t('logbook.soon', 'Soon');
  }
  const tone = overdue ? COLORS.error : '#f59e0b';
  return (
    <View style={s.dueRow}>
      <Ionicons name={overdue ? 'alert-circle' : 'time-outline'} size={18} color={tone} />
      <View style={s.grow}>
        <Text style={[s.expenseTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.assetName} · {item.label}
        </Text>
        <Text style={[s.cardSub, { color: tone }]} numberOfLines={1}>{when}</Text>
      </View>
    </View>
  );
}

/** One thing I logged, with what happened to it — and a way to take it back while it waits. */
function EntryRow({ entry, colors, t, onWithdraw }: { entry: MyLogEntry; colors: any; t: any; onWithdraw: () => void }) {
  const tone =
    entry.status === 'RECORDED' ? { c: '#22c55e', icon: 'checkmark-circle' as const, label: t('logbook.recorded', 'Recorded') }
    : entry.status === 'REJECTED' ? { c: colors.textMuted, icon: 'close-circle' as const, label: t('expenses.rejected', 'Refused') }
    : { c: '#f59e0b', icon: 'time' as const, label: t('logbook.submitted', 'Waiting for the office') };

  return (
    <View style={[s.expense, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={tone.icon} size={18} color={tone.c} />
      <View style={s.grow}>
        <Text style={[s.expenseTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {entry.asset?.name ?? t('myAssets.anAsset', 'An asset')} · {entry.category}
        </Text>
        <Text style={[s.cardSub, { color: colors.textMuted }]} numberOfLines={2}>
          {new Date(entry.occurredAt).toLocaleDateString()} · {tone.label}
          {/* The reason it was refused, in the words somebody wrote. */}
          {entry.reviewNote ? ` — ${entry.reviewNote}` : ''}
        </Text>
        {entry.status === 'SUBMITTED' && (
          <TouchableOpacity onPress={onWithdraw} hitSlop={8}>
            <Text style={s.withdraw}>{t('logbook.withdraw', 'Take back')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {entry.amountCents > 0 && (
        <Text style={[s.expenseAmount, { color: entry.status === 'REJECTED' ? colors.textMuted : colors.textPrimary }]}>
          {euros(entry.amountCents)}
        </Text>
      )}
    </View>
  );
}

function ExpenseRow({ expense, colors, t }: { expense: MyExpense; colors: any; t: any }) {
  const tone =
    expense.status === 'RECORDED' ? { c: '#22c55e', icon: 'checkmark-circle' as const, label: t('expenses.accepted', 'Accepted') }
    : expense.status === 'REJECTED' ? { c: colors.textMuted, icon: 'close-circle' as const, label: t('expenses.rejected', 'Refused') }
    : { c: '#f59e0b', icon: 'time' as const, label: t('expenses.pending', 'Waiting') };

  return (
    <View style={[s.expense, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={tone.icon} size={18} color={tone.c} />
      <View style={s.grow}>
        <Text style={[s.expenseTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {expense.asset?.name ?? t('myAssets.anAsset', 'An asset')} · {expense.category}
        </Text>
        <Text style={[s.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
          {new Date(expense.occurredAt).toLocaleDateString()} · {tone.label}
          {/* The reason it was refused, in the words somebody wrote. A refusal
              with no reason teaches nothing and gets re-sent unchanged. */}
          {expense.reviewNote ? ` — ${expense.reviewNote}` : ''}
        </Text>
      </View>
      <Text style={[s.expenseAmount, { color: expense.status === 'REJECTED' ? colors.textMuted : colors.textPrimary }]}>
        {euros(expense.amountCents)}
      </Text>
    </View>
  );
}

function ProposalRow({ proposal, colors, t }: { proposal: MyProposal; colors: any; t: any }) {
  const tone =
    proposal.status === 'ACCEPTED' ? { c: '#22c55e', icon: 'checkmark-circle' as const, label: t('expenses.accepted', 'Accepted') }
    : proposal.status === 'REJECTED' ? { c: colors.textMuted, icon: 'close-circle' as const, label: t('expenses.rejected', 'Refused') }
    : proposal.status === 'WITHDRAWN' ? { c: colors.textMuted, icon: 'arrow-undo' as const, label: t('sendDoc.withdrawn', 'Taken back') }
    : { c: '#f59e0b', icon: 'time' as const, label: t('expenses.pending', 'Waiting') };

  const f = proposal.fields ?? {};
  const name = f.name || f.registration || f.serial || [f.manufacturer, f.model].filter(Boolean).join(' ');

  return (
    <View style={[s.expense, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={tone.icon} size={18} color={tone.c} />
      <View style={s.grow}>
        <Text style={[s.expenseTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {name || t('sendDoc.aPage', 'A page')}
        </Text>
        <Text style={[s.cardSub, { color: colors.textMuted }]} numberOfLines={2}>
          {new Date(proposal.createdAt).toLocaleDateString()} · {tone.label}
          {/* The reason it was refused, verbatim. A refusal with none teaches
              nothing and gets re-sent unchanged. */}
          {proposal.reviewNote ? ` — ${proposal.reviewNote}` : ''}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end' },

  empty: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xxxl },
  emptyText: { fontSize: FONT_SIZE.sm, textAlign: 'center' },

  card: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  icon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  cardSub: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, marginTop: SPACING.md, paddingTop: SPACING.md },
  metaLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  metaValue: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any, marginTop: 2 },

  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.md, height: 44, marginTop: SPACING.md },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.base, fontWeight: '700' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: RADIUS.md, height: 46, marginTop: SPACING.sm },
  secondaryText: { fontSize: FONT_SIZE.base, fontWeight: '700' },

  sectionTitle: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  expense: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  expenseTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium as any },
  expenseAmount: { fontSize: FONT_SIZE.sm, fontWeight: '700' },

  picker: { borderWidth: 1, borderRadius: RADIUS.md, marginTop: SPACING.sm, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  pickText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium as any },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dueBox: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  withdraw: { color: COLORS.primary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginTop: 4 },
});
