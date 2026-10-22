import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { openChecklistOf, splitChecklist, tickedByOther, personName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { useToast } from '@/island/island-context';
import { tasksApi, type CrewView } from '@/lib/api';
import { refusalText } from '@/lib/distance';
import { AText, Well, SectionLabel, SheetOption } from '@/components/amazen';
import { TickGlyph } from './job-glyphs';
import { JobSheet } from './job-ui';
import { patchOptimistic, tickOptimistic, type CheckItem, type ChecklistMode } from './job-logic';

const firstName = (u?: { firstName: string } | null) => u?.firstName ?? '';

/**
 * The checklist — TICKABLE by the person doing the job at a step that opens
 * it (`checklist` capability), a read-only count everywhere else.
 *
 * On a crew it says WHO (shared tasks/checklist.ts): the member's own items
 * first, an owner beside the rest, "Take it" on a free one, and who ticked each
 * item and when. The leader (or the office) gives an item to somebody by
 * tapping its owner. ⚠️ An owner is not a lock — every box stays tickable.
 *
 * ⚠️ A CHANGE IS OPTIMISTIC AND ROLLS BACK ALONE. The box moves under the thumb
 * at once; if the server refuses, only that item moves back and the member is
 * told. `patchOptimistic` in `job-logic.ts` is the rule, and is tested.
 *
 * ⚠️ NO SIGNAL, NO TICK. There is no outbox operation for a checklist item,
 * so a change made offline would be lost in silence. The boxes stay, still,
 * with a line that says why.
 */
export function JobChecklist({
  taskId,
  items: fromServer,
  mode,
  opensAtLabel,
  meId,
  crew,
  mayHandOut,
}: {
  taskId: string;
  items: CheckItem[];
  mode: ChecklistMode;
  /** The step at which ticking opens, for the read-only line. */
  opensAtLabel: string | null;
  meId: string | null | undefined;
  /** This job's crew, when it has one (GET /tasks/:id/time). */
  crew: CrewView | null | undefined;
  /** The leader or the office: may give any item to anybody on the crew. The server judges it again. */
  mayHandOut: boolean;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const { formatClock } = useTimeFormat();
  const c = amazen.color;
  const [items, setItems] = useState<CheckItem[]>(() => fromServer);
  const [picking, setPicking] = useState<CheckItem | null>(null);
  const inFlight = useRef(0);
  const latest = useRef(fromServer);
  latest.current = fromServer;
  const keyNow = useRef('');
  /*
    The server's copy wins again once nothing is in flight — a socket refresh
    after somebody else's change converges here. ⚠️ Every field a screen shows
    is in the key (a reworded or reordered item from the office reached nobody),
    and a refresh that lands MID-change is applied when the change settles
    rather than dropped.
  */
  const key = fromServer
    .map(
      (i) =>
        `${i.id}:${i.position}:${i.text}:${i.isCompleted}:${i.assigneeId ?? ''}:${i.completedById ?? ''}:${i.completedAt ?? ''}`,
    )
    .join('|');
  keyNow.current = key;
  useEffect(() => {
    if (inFlight.current === 0) setItems(fromServer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The server copy the screen last took — a refresh that lands mid-change differs from it.
  const taken = useRef(key);
  useEffect(() => { if (inFlight.current === 0) taken.current = key; }, [key]);
  const settle = () => {
    inFlight.current -= 1;
    /*
      ⚠️ ONLY A NEWER SERVER COPY. Re-applying the props unconditionally put back
      the copy from BEFORE this change (the page had not refetched yet) and the
      item the member had just taken showed "Take it" again.
    */
    if (inFlight.current === 0 && taken.current !== keyNow.current) {
      taken.current = keyNow.current;
      setItems(latest.current);
    }
  };

  if (items.length === 0) return null;
  const members = crew?.members ?? [];
  const onCrew = !!meId && members.some((m) => m.user.id === meId);
  // A team view only where there is a team: a one-person job keeps the plain list.
  const team = members.length > 1 || items.some((i) => i.assigneeId);
  const done = items.filter((i) => i.isCompleted).length;
  const mineOpen = meId ? openChecklistOf(items, meId).length : 0;

  if (mode === 'readonly') {
    return (
      <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.5), gap: amazen.space(1.5) }}>
        <SectionLabel>{t('job.checklist.title', { done, total: items.length })}</SectionLabel>
        {team && mineOpen ? <AText variant="caption" tone="accent">{t('job.checklist.yoursOpen', { count: mineOpen })}</AText> : null}
        {opensAtLabel ? <AText variant="caption" tone="ink">{t('job.checklist.opensAt', { step: opensAtLabel })}</AText> : null}
      </Well>
    );
  }

  const change = async (item: CheckItem, patch: Partial<CheckItem>, send: () => Promise<unknown>) => {
    inFlight.current += 1;
    // Keep the refusal: "somebody took it just now" is a different sentence from "no signal".
    let refused: { code?: string; message?: string } = {};
    const ok = await patchOptimistic(item.id, patch, setItems, () => send().catch((e) => { refused = e ?? {}; throw e; }));
    settle();
    if (!ok) toast.error(refusalText(t, refused, t('job.checklist.failed')));
  };
  const tick = async (item: CheckItem) => {
    inFlight.current += 1;
    const ok = await tickOptimistic(item.id, !item.isCompleted, setItems, () =>
      tasksApi.toggleChecklistItem(taskId, item.id, !item.isCompleted),
    );
    settle();
    if (!ok) toast.error(t('job.checklist.failed'));
  };
  const giveTo = (item: CheckItem, userId: string | null) => {
    const person = userId ? members.find((m) => m.user.id === userId)?.user ?? null : null;
    void change(item, { assigneeId: userId, assignee: person }, () => tasksApi.setChecklistOwner(taskId, item.id, userId));
  };

  const canTick = mode === 'tick';
  /*
    Has the owner LEFT the job — taken off the crew, or joined and gone again?
    ⚠️ Not "not joined": before the crew arrives in the morning nobody has
    joined, and every owned item read "has left" to the leader.
  */
  const left = (userId: string) => {
    const m = members.find((x) => x.user.id === userId);
    return !m || (!m.joined && !!m.lastLeftAt);
  };

  const row = (item: CheckItem) => {
    const on = item.isCompleted;
    const mine = !!meId && item.assigneeId === meId;
    const who = (u?: { id: string; firstName: string } | null) => (u && u.id === meId ? t('job.checklist.you') : firstName(u));
    // The line under the text: who did it, and for whom when that was somebody else.
    const doneLine = !team || !on || !item.completedAt
      ? null
      : tickedByOther(item)
        ? t('job.checklist.doneFor', { owner: firstName(item.assignee), name: who(item.completedBy), time: formatClock(item.completedAt) })
        : t('job.checklist.doneBy', { name: who(item.completedBy), time: formatClock(item.completedAt) });
    // Open, owned by somebody who has left the job — the leader is the one who acts on it.
    const stranded = team && !on && !!item.assigneeId && !mine && mayHandOut && left(item.assigneeId);
    const free = team && !item.assigneeId && !on;
    return (
      <View
        key={item.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
          minHeight: amazen.layout.tapMin,
          paddingVertical: amazen.space(1.5),
        }}>
        <Pressable
          onPress={canTick ? () => void tick(item) : undefined}
          disabled={!canTick}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on, disabled: !canTick }}
          accessibilityLabel={item.text}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: amazen.space(3),
            opacity: !canTick ? 0.6 : pressed ? 0.75 : 1,
          })}
        >
          <View style={{
            width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.8, borderColor: on ? c.accentSolid : c.inkMuted, backgroundColor: on ? c.accentSolid : 'transparent',
          }}>
            {on ? <TickGlyph size={14} color={c.accentInk} /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AText
              variant="body"
              numberOfLines={3}
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: on ? c.inkMuted : c.inkStrong,
                textDecorationLine: on ? 'line-through' : 'none',
              }}>
              {item.text}
            </AText>
            {doneLine ? <AText variant="caption" tone="muted">{doneLine}</AText> : null}
            {stranded ? (
              <AText variant="caption" tone="warn">
                {t('job.checklist.ownerLeft', { name: firstName(item.assignee) })}
              </AText>
            ) : null}
          </View>
        </Pressable>
        {team && item.assigneeId && !mine ? (
          <OwnerTag label={firstName(item.assignee)} onPress={mayHandOut && canTick ? () => setPicking(item) : undefined} />
        ) : team && mine && !on && canTick ? (
          // My own item: the leader passes it on; a member gives it back (shared mayChangeChecklistOwner).
          <OwnerTag
            label={mayHandOut ? t('job.checklist.you') : t('job.checklist.giveBack')}
            onPress={() => (mayHandOut ? setPicking(item) : giveTo(item, null))}
          />
        ) : free && canTick && (onCrew || mayHandOut) ? (
          <OwnerTag
            label={mayHandOut ? t('job.checklist.giveTo') : t('job.checklist.takeIt')}
            accent
            onPress={() => (mayHandOut ? setPicking(item) : giveTo(item, meId ?? null))}
          />
        ) : null}
      </View>
    );
  };

  const { mine, crew: rest } = splitChecklist(items, team ? meId : null);
  return (
    <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.5) }}>
      <SectionLabel tone={canTick ? 'accent' : 'muted'}>{t('job.checklist.thisStep', { done, total: items.length })}</SectionLabel>
      {mode === 'offline' ? (
        <AText variant="caption" tone="warn" style={{ marginTop: amazen.space(1) }}>
          {t('job.checklist.offline')}
        </AText>
      ) : null}
      {mine.length ? (
        <>
          <AText variant="caption" tone="accent" style={{ marginTop: amazen.space(2) }}>
            {t('job.checklist.mine', { count: mine.length })}
          </AText>
          {mine.map(row)}
          {rest.length ? (
            <AText variant="caption" tone="muted" style={{ marginTop: amazen.space(2) }}>
              {t('job.checklist.crew', { count: rest.length })}
            </AText>
          ) : null}
        </>
      ) : null}
      {rest.map(row)}

      <JobSheet visible={!!picking} onClose={() => setPicking(null)} title={t('job.checklist.ownerTitle')} eyebrow={picking?.text}>
        <View style={{ gap: 8 }}>
          {members.map((m) => (
            <SheetOption
              key={m.user.id}
              label={picking?.assigneeId === m.user.id ? `✓  ${personName(m.user)}` : personName(m.user)}
              tone={picking?.assigneeId === m.user.id ? 'accent' : 'strong'}
              hint={m.joined ? t('job.crew.onJobShort') : t('job.crew.notOnJob')}
              onPress={() => { if (picking) giveTo(picking, m.user.id); setPicking(null); }}
            />
          ))}
          <SheetOption
            label={t('job.checklist.nobody')}
            tone={picking && !picking.assigneeId ? 'accent' : 'strong'}
            onPress={() => { if (picking) giveTo(picking, null); setPicking(null); }}
          />
        </View>
      </JobSheet>
    </Well>
  );
}

function OwnerTag({ label, onPress, accent }: { label: string; onPress?: () => void; accent?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      hitSlop={8}
      style={({ pressed }) => ({
        borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(2.5), paddingVertical: amazen.space(1),
        backgroundColor: accent ? c.accentSolid : c.tile, opacity: pressed ? 0.75 : 1,
      })}
    >
      <AText variant="caption" style={{ color: accent ? c.accentInk : c.ink, fontSize: 12 }}>{label}</AText>
    </Pressable>
  );
}
