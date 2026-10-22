import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { locationsApi, techniciansApi, type TechnicianListItem } from '../../../lib/api';
import { knownOffline } from '../../../offline/connectivity';
import { AText, Initials, JobField, Pill } from '../../../components/amazen';
import { JobSheet } from '../job-ui';
import { personName } from '@hbcfield/shared/client';

export interface AssignMember {
  id: string;
  firstName: string;
  lastName: string;
}

interface Row extends AssignMember {
  role: string | null;
  state: string | null;
}

/**
 * "Who does it?" — one list of the people a job can go to, with their role and
 * how busy they are. REUSABLE: the job page, the Jobs tab and New job all pick
 * a person through this, so the list reads the same everywhere.
 *
 * Where it reads from:
 *  - the employee directory (`techniciansApi.list`, active, 50) — the source
 *    the old `TechnicianPicker` used, which carries role and load;
 *  - narrowed to the WORKSPACE roster when `spaceId` is given, because a job
 *    at one site should not be offered to somebody who never works there;
 *  - and when the directory is refused (a member whose authority is one
 *    space cannot read the org-wide directory) the roster alone, which is
 *    scoped server-side to the spaces the caller may see.
 *
 * ⚠️ No signal, no list: assigning has no outbox operation, so the sheet says
 * so instead of offering people it cannot give the job to.
 */
export function AssignSheet({
  visible,
  current,
  spaceId,
  busy = false,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The member who has it now — marked, and picking them again does nothing. */
  current?: string | null;
  spaceId?: string | null;
  busy?: boolean;
  onPick: (member: AssignMember) => void;
  onClose: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const offline = visible && knownOffline();

  const load = useCallback(async () => {
    setRows(null);
    setFailed(false);
    const roster = spaceId ? await locationsApi.getRosters([spaceId]).catch(() => null) : null;
    const onRoster = roster ? new Set(roster.map((a) => a.userId)) : null;
    try {
      const result = await techniciansApi.list({ status: 'active', limit: 50 });
      const all: TechnicianListItem[] = Array.isArray(result) ? result : (result?.data ?? []);
      setRows(
        all
          .filter((m) => !onRoster || onRoster.has(m.id))
          .map((m) => ({
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            role: m.position || m.specialty || null,
            state: [
              m.isOnline ? t('job.assign.online') : null,
              t('job.assign.jobs', { count: m.currentTaskCount ?? 0 }),
            ]
              .filter(Boolean)
              .join(' · '),
          })),
      );
    } catch {
      // The directory refused — the roster is the answer when there is one.
      if (roster) {
        setRows(
          roster
            .filter((a) => a.user)
            .map((a) => ({
              id: a.userId,
              firstName: a.user!.firstName,
              lastName: a.user!.lastName,
              role: null,
              state: null,
            })),
        );
      } else {
        setFailed(true);
        setRows([]);
      }
    }
  }, [spaceId, t]);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    if (!knownOffline()) void load();
  }, [visible, load]);

  const shown = (rows ?? []).filter((r) => !q.trim() || personName(r).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.assign.title')} busy={busy}>
      {offline ? (
        <AText variant="caption" tone="warn">
          {t('job.needsSignal')}
        </AText>
      ) : rows === null ? (
        <View style={{ paddingVertical: amazen.space(6), alignItems: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <>
          {(rows?.length ?? 0) > 8 ? (
            <JobField value={q} onChangeText={setQ} placeholder={t('job.assign.search')} autoCorrect={false} />
          ) : null}
          {failed ? (
            <AText variant="caption" tone="critical">
              {t('job.assign.failed')}
            </AText>
          ) : null}
          {!failed && shown.length === 0 ? (
            <AText variant="caption" tone="ink">
              {t('job.assign.none')}
            </AText>
          ) : null}
          {shown.map((m) => {
            const sel = m.id === current;
            return (
              <Pressable
                key={m.id}
                onPress={busy || sel ? undefined : () => onPick(m)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: sel, disabled: busy }}
                accessibilityLabel={personName(m)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: amazen.space(3),
                  paddingVertical: amazen.space(2.25),
                  paddingHorizontal: amazen.space(1),
                  borderRadius: 12,
                  backgroundColor: sel ? c.accentTint : pressed ? c.tile : 'transparent',
                })}
              >
                <Initials first={m.firstName} last={m.lastName} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 20 }}>
                    {personName(m)}
                  </AText>
                  {m.role || m.state ? (
                    <AText variant="caption" tone="ink" numberOfLines={1}>
                      {[m.role, m.state].filter(Boolean).join(' · ')}
                    </AText>
                  ) : null}
                </View>
                {sel ? <Pill tone="accent" label={t('job.assign.now')} /> : null}
              </Pressable>
            );
          })}
        </>
      )}
    </JobSheet>
  );
}
