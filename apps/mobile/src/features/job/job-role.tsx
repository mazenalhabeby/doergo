import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isOpenToRole, isWorkOver, spotsTaken } from '@hbcfield/shared/client';
import { tasksApi } from '../../lib/api';
import { refusalText } from '../../lib/distance';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { AText, QuietButton, SectionLabel } from '../../components/amazen';

type RoleTask = {
  id: string;
  title: string;
  status: string;
  openRoleId?: string | null;
  openRole?: { name: string } | null;
  openSpots?: number | null;
  openSpotsLeft?: number | null;
  assignees?: { userId?: string; user?: { id: string } }[];
};

/**
 * A job OPEN TO A WORK ROLE, on the job page (shared tasks/role-pool.ts).
 *
 * Somebody holding the role and not on it yet: "Take it". Somebody who took it,
 * before the work starts: "Hand back" — it goes back to the role and is offered
 * again, never to nobody. Everyone else: one line saying how many are taken.
 *
 * ⚠️ "May I take it" is the SERVER's answer (the job is in my open-for-me
 * list), asked once when the page opens — never decided from roles on the phone.
 * Online only: a take queued offline would promise a place somebody else got.
 */
export function JobRoleCard({ task, meId, onChanged }: { task: RoleTask; meId: string | undefined; onChanged: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const c = amazen.color;
  const [mayTake, setMayTake] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = isOpenToRole(task);
  const onIt = !!meId && (task.assignees ?? []).some((a) => (a.userId ?? a.user?.id) === meId);
  useEffect(() => {
    if (!open || onIt) { setMayTake(false); return; }
    let live = true;
    tasksApi.openForMe().then((rows) => { if (live) setMayTake(rows.some((r) => r.id === task.id)); }).catch(() => undefined);
    return () => { live = false; };
  }, [open, onIt, task.id]);

  if (!task.openRoleId) return null;
  const { taken, of } = spotsTaken(task);
  // "Not started" by facts, as the server asks it — a custom flow's first step counts (the server has the last word).
  const notStarted = !['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'BLOCKED'].includes(task.status) && !isWorkOver(task.status);

  const act = async (kind: 'take' | 'back') => {
    setBusy(true);
    try {
      if (kind === 'take') {
        await tasksApi.take(task.id);
        toast.success(t('roleTasks.youTookIt'), task.title);
      } else {
        await tasksApi.returnToRole(task.id);
        toast.info(t('roleTasks.returned'));
      }
      onChanged();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      toast.error(t(kind === 'take' ? 'roleTasks.couldNotTake' : 'roleTasks.couldNotReturn'), refusalText(t, err, ''));
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ backgroundColor: c.tile, borderRadius: amazen.radius.field, padding: amazen.space(4), gap: amazen.space(2) }}>
      <SectionLabel tone={open ? 'accent' : 'muted'}>
        {open ? t('roleTasks.openTo', { role: task.openRole?.name ?? '' }) : t('roleTasks.takenFrom', { role: task.openRole?.name ?? '' })}
      </SectionLabel>
      <AText variant="caption" tone="ink">{t('roleTasks.takenOf', { taken, of })}</AText>
      {mayTake ? (
        <QuietButton
          tone="accent"
          label={busy ? t('roleTasks.taking') : t('roleTasks.take')}
          disabled={busy}
          onPress={() => void act('take')}
        />
      ) : onIt && notStarted ? (
        <QuietButton tone="strong" label={t('roleTasks.giveBack')} disabled={busy} onPress={() => void act('back')} />
      ) : null}
    </View>
  );
}
