import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { canReceiveTasks, personName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { locationsApi, portalOfficeApi, type LocationAssignment } from '@/lib/api';
import type { TriageInput } from '@/lib/api/portal-office';
import { holdsIn } from '@/lib/permissions';
import { formatDay } from '@/lib/money';
import { useResponsive } from '@/lib/responsive';
import {
  AText,
  ChoicePill,
  FilterRow,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Pill,
  SectionLabel,
  SheetOption,
} from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { JobSheet } from '../job/job-ui';
import { knownRequest, requestsOfPortal, type ListedRequest } from './requests-store';
import { FactsWell } from '@/components/facts-well';
import { caught } from '@/lib/caught';

const PRIORITIES: TriageInput['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/**
 * ONE CLIENT REQUEST, still waiting — and the one answer the phone gives it:
 * turn it into a job in this workspace (priority, and who does it).
 *
 * Answering needs `canAnswerPortal` in the portal's workspace; naming who does
 * the job is assigning work, so the picker shows only with `canAssignTasks`
 * there too — the server asks both. The workspace is the portal's and is not a
 * choice here; the job takes the workspace's own flow.
 */
export function RequestDetail({ id, portalId, spaceId }: { id: string; portalId: string; spaceId: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [req, setReq] = useState<ListedRequest | null>(knownRequest(id));
  const [missing, setMissing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [priority, setPriority] = useState<TriageInput['priority']>('MEDIUM');
  const [worker, setWorker] = useState<string | null>(null);
  const [roster, setRoster] = useState<LocationAssignment[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (req) return;
    requestsOfPortal(portalId, spaceId)
      .then((rows) => {
        const hit = rows.find((x) => x.id === id);
        if (hit) setReq(hit);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [req, id, portalId, spaceId]);

  const mayAnswer = holdsIn(user as never, 'canAnswerPortal', spaceId);
  const mayAssign = holdsIn(user as never, 'canAssignTasks', spaceId);

  useEffect(() => {
    if (!sheet || !mayAssign || roster) return;
    locationsApi
      .getAssignedMembers(spaceId)
      .then(setRoster)
      .catch(() => setRoster([]));
  }, [sheet, mayAssign, roster, spaceId]);

  const triage = useCallback(async () => {
    setBusy(true);
    try {
      await portalOfficeApi.triage(id, { spaceId, priority, assignedToId: worker });
      toast.success(t('clientRequests.jobCreated', 'Job created'));
      setSheet(false);
      router.replace(`/(app)/task/${id}` as Href);
    } catch (e: unknown) {
      toast.error(caught(e).message || t('register.failed', 'That did not work — try again.'));
    } finally {
      setBusy(false);
    }
  }, [id, spaceId, priority, worker, toast, t]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/client-requests' as Href));

  if (missing) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('clientRequests.title', 'Client requests')} leading={<HeaderBack onPress={back} />} />
        <AText variant="body" tone="onGlass" style={{ textAlign: 'center', padding: amazen.space(8) }}>
          {t('clientRequests.notFound', 'This request is not in your workspaces.')}
        </AText>
      </Ground>
    );
  }
  if (!req) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('clientRequests.title', 'Client requests')} leading={<HeaderBack onPress={back} />} />
        <ActivityIndicator style={{ marginTop: amazen.space(10) }} color={c.accent} />
      </Ground>
    );
  }

  const facts: [string, string][] = [
    [t('clientRequests.from', 'From'), req.customerName ?? '—'],
    ...(req.unitName
      ? ([[t('clientRequests.unit', 'Unit'), [req.unitName, req.unitAddress].filter(Boolean).join(' · ')]] as [
          string,
          string,
        ][])
      : []),
    [t('clientRequests.sent', 'Sent'), formatDay(req.createdAt, i18n.language)],
  ];
  const waiting = !req.triaged;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={req.reference} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(30), gap: amazen.space(3) },
          wide,
        ]}
      >
        <View style={{ gap: amazen.space(1.5), alignItems: 'flex-start' }}>
          <AText variant="h2" tone="strong">
            {req.title}
          </AText>
          <Pill
            label={waiting ? t('clientRequests.waiting', 'Waiting') : t('clientRequests.becameJob', 'Became a job')}
            tone={waiting ? 'warn' : 'accent'}
          />
        </View>
        {req.description ? (
          <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, padding: amazen.space(3.5) }}>
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
              {req.description}
            </AText>
          </View>
        ) : null}
        <FactsWell amazen={amazen} facts={facts} lines={2} />
      </ScrollView>

      <View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: amazen.space(4),
            paddingTop: amazen.space(3),
            paddingBottom: amazen.space(8),
            backgroundColor: c.canvas,
          },
          wide,
        ]}
      >
        {!waiting ? (
          <PrimaryButton
            label={t('clientRequests.openJob', 'Open the job')}
            onPress={() => router.replace(`/(app)/task/${id}` as Href)}
          />
        ) : mayAnswer ? (
          <PrimaryButton label={t('clientRequests.turnIntoJob', 'Turn into a job')} onPress={() => setSheet(true)} />
        ) : (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
            {t('clientRequests.readOnly', 'You can read requests. Answering needs Answer in this workspace.')}
          </AText>
        )}
      </View>

      <JobSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        busy={busy}
        title={t('clientRequests.turnIntoJob', 'Turn into a job')}
        eyebrow={<SectionLabel>{req.title}</SectionLabel>}
      >
        <SectionLabel>{t('clientRequests.priority', 'Priority')}</SectionLabel>
        <FilterRow>
          {PRIORITIES.map((p) => (
            <ChoicePill key={p} label={t(`priority.${p}`)} on={priority === p} onPress={() => setPriority(p)} />
          ))}
        </FilterRow>
        {mayAssign ? (
          <>
            <SectionLabel>{t('clientRequests.whoDoesIt', 'Who does it')}</SectionLabel>
            {roster === null ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <>
                <SheetOption
                  label={t('clientRequests.decideLater', 'Decide later')}
                  tone={worker === null ? 'accent' : 'strong'}
                  onPress={() => setWorker(null)}
                />
                {/* Only people who can take a job — a profile without Tasks is refused by the server. */}
                {roster
                  .filter((m) => m.user && canReceiveTasks(m.user as never))
                  .map((m) => (
                    <SheetOption
                      key={m.userId}
                      label={personName(m.user)}
                      tone={worker === m.userId ? 'accent' : 'strong'}
                      onPress={() => setWorker(m.userId)}
                    />
                  ))}
              </>
            )}
          </>
        ) : null}
        <PrimaryButton
          label={t('clientRequests.createJob', 'Create job')}
          loading={busy}
          disabled={busy}
          onPress={() => void triage()}
        />
        <AText variant="caption" tone="muted">
          {t('clientRequests.residentSees', 'The resident sees their request move on in their app.')}
        </AText>
      </JobSheet>
    </Ground>
  );
}
