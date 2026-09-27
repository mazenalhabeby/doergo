import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { joinRequestsApi, membersApi, orgSettingsApi, rolesApi, type JoinRequest, type OrgRole } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well } from '../amazen';
import { centeredContent } from '../screen-container';
import { Banner, JobField, JobSheet, SectionLabel } from '../job/job-ui';
import { timeAgo } from '../team/helpers';
import { PersonAvatar } from './person-avatar';

/**
 * JOIN REQUESTS — people who used the join code, waiting to be let in.
 *
 * ⚠️ APPROVE WAS BROKEN ON THE PHONE. It sent `role: 'TECHNICIAN'`, a role
 * retired long ago, and the server accepts only ADMIN or EMPLOYEE — so every
 * approval from the phone was refused.
 *
 * ⚠️ THE ROLE IS GIVEN THROUGH THE ONE GRANT PATH. Approving lets them in as an
 * employee; the role chosen is then set with `PATCH /organizations/members/:id`
 * — the route that refuses a role granting more than the approver holds. A
 * second grant path inside the approval would be a second place to forget that.
 */
export function JoinRequestsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<JoinRequest | null>(null);
  const [declining, setDeclining] = useState<JoinRequest | null>(null);

  const load = useCallback(async () => {
    const [reqs, rs, code] = await Promise.allSettled([
      joinRequestsApi.list({ status: 'PENDING' }),
      rolesApi.list(),
      orgSettingsApi.getJoinCode(),
    ]);
    if (reqs.status === 'fulfilled') setRequests(reqs.value);
    else {
      setRequests((x) => x ?? []);
      toast.error(t('common.error'), t('manage.joinRequestsScreen.failedToLoad'));
    }
    if (rs.status === 'fulfilled') setRoles(rs.value.filter((x) => x.scope === 'ORG' && x.slug !== 'admin'));
    if (code.status === 'fulfilled') setJoinCode(code.value.joinCode ?? null);
  }, [toast, t]);
  useLiveRefresh(load, null);

  const list = requests ?? [];

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('manage.joinRequests.label', 'Join requests')}
        leading={<HeaderBack onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href))} />}
        style={wide ?? undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        {requests === null ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('common.loading', 'Loading…')}</AText>
        ) : list.length === 0 ? (
          <Well style={{ paddingVertical: amazen.space(8), paddingHorizontal: amazen.space(5), alignItems: 'center', gap: amazen.space(2) }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
              <AText variant="h2" tone="accent">✓</AText>
            </View>
            <AText variant="h3" tone="strong" style={{ fontFamily: amazen.font.sansLight }}>{t('manage.joinRequestsScreen.allCaughtUp', 'All caught up')}</AText>
            <AText variant="body" tone="ink" style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 20 }}>
              {t('joinRequests.emptyBody', 'When someone uses your join code, they wait here for you to let them in.')}
            </AText>
          </Well>
        ) : (
          list.map((req) => (
            <Well key={req.id} style={{ padding: amazen.space(3.5), gap: amazen.space(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
                <PersonAvatar person={req.user} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 15 }}>{`${req.user.firstName} ${req.user.lastName}`}</AText>
                  <AText variant="caption" tone="muted" numberOfLines={1}>{`${req.user.email} · ${t('joinRequests.asked', { defaultValue: 'asked {{when}}', when: timeAgo(req.createdAt) })}`}</AText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
                <Pressable onPress={() => setDeclining(req)} accessibilityRole="button"
                  style={({ pressed }) => ({ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(4.5), minHeight: amazen.layout.tapMin + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tile, opacity: pressed ? 0.75 : 1 })}>
                  <AText variant="body" tone="ink" style={{ fontSize: 15 }}>{t('joinRequests.decline', 'Decline')}</AText>
                </Pressable>
                <PrimaryButton style={{ flex: 1 }} label={t('common.approve', 'Approve')} onPress={() => setApproving(req)} />
              </View>
            </Well>
          ))
        )}

        {joinCode ? (
          <View style={{ gap: amazen.space(2) }}>
            <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{t('joinRequests.yourCode', 'Your join code')}</SectionLabel>
            <Well style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(3.5) }}>
              <AText numeric selectable style={{ flex: 1, fontFamily: amazen.font.mono, fontSize: 17, letterSpacing: 3, color: c.inkStrong }}>{joinCode}</AText>
              <Pressable onPress={() => void Share.share({ message: t('joinRequests.shareCode', { defaultValue: 'Join us on HBCField with the code {{code}}', code: joinCode }) })} accessibilityRole="button"
                style={({ pressed }) => ({ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.tile, opacity: pressed ? 0.75 : 1 })}>
                <AText variant="caption" tone="ink" style={{ fontSize: 13 }}>{t('joinRequests.share', 'Share')}</AText>
              </Pressable>
            </Well>
          </View>
        ) : null}
      </ScrollView>

      <ApproveSheet request={approving} roles={roles} onClose={() => setApproving(null)} onDone={() => { setApproving(null); void load(); }} />
      <DeclineSheet request={declining} onClose={() => setDeclining(null)} onDone={() => { setDeclining(null); void load(); }} />
    </Ground>
  );
}

function ApproveSheet({ request, roles, onClose, onDone }: { request: JoinRequest | null; roles: OrgRole[]; onClose: () => void; onDone: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!request) return <JobSheet visible={false} onClose={onClose}><View /></JobSheet>;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinRequestsApi.approve(request.id, { role: 'EMPLOYEE' });
    } catch (e) {
      setBusy(false);
      setError((e as Error)?.message || t('manage.joinRequestsScreen.failedToApprove'));
      return;
    }
    // In — now the role, through the guarded path. A refusal leaves them in with no role, and says so.
    if (roleId) {
      try {
        await membersApi.setRole(request.userId, roleId);
      } catch (e) {
        toast.warning(t('joinRequests.inWithoutRole', 'They are in, without that role'), (e as Error)?.message || '');
      }
    }
    setBusy(false);
    setRoleId(null);
    onDone();
  };

  const opt = (id: string | null, name: string, dot?: string | null) => {
    const on = roleId === id;
    return (
      <Pressable key={id ?? 'none'} onPress={() => setRoleId(id)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(3.25), borderRadius: 16, backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot ?? c.lineField }} />
        <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{name}</AText>
        {on ? <AText variant="body" tone="accent">✓</AText> : null}
      </Pressable>
    );
  };

  return (
    <JobSheet visible onClose={onClose} busy={busy} title={t('joinRequests.letInAs', { defaultValue: 'Let {{name}} in as…', name: request.user.firstName })}>
      <View style={{ gap: amazen.space(2) }}>
        {opt(null, t('joinRequests.noRoleYet', 'Employee — no role yet'))}
        {roles.map((ro) => opt(ro.id, ro.name, ro.color))}
      </View>
      {error ? <Banner tone="critical" text={error} /> : null}
      <PrimaryButton label={t('joinRequests.approveName', { defaultValue: 'Approve {{name}}', name: request.user.firstName })} onPress={() => void approve()} loading={busy} />
      <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
        <AText variant="body" tone="muted" style={{ fontSize: 14 }}>{t('extraTime.notNow', 'Not now')}</AText>
      </Pressable>
    </JobSheet>
  );
}

function DeclineSheet({ request, onClose, onDone }: { request: JoinRequest | null; onClose: () => void; onDone: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!request) return <JobSheet visible={false} onClose={onClose}><View /></JobSheet>;
  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinRequestsApi.reject(request.id, reason.trim() || undefined);
      setReason('');
      onDone();
    } catch (e) {
      setError((e as Error)?.message || t('manage.joinRequestsScreen.failedToReject'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <JobSheet visible onClose={onClose} busy={busy} title={t('joinRequests.declineName', { defaultValue: 'Decline {{name}}?', name: request.user.firstName })}>
      <JobField value={reason} onChangeText={setReason} placeholder={t('joinRequests.reason', 'Reason, if you want to say (optional)')} multiline maxLength={300} />
      {error ? <Banner tone="critical" text={error} /> : null}
      <PrimaryButton label={t('joinRequests.keepWaiting', 'Keep waiting')} onPress={onClose} />
      <Pressable onPress={() => void decline()} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
        <AText variant="body" tone="critical" style={{ fontSize: 14.5 }}>{t('joinRequests.decline', 'Decline')}</AText>
      </Pressable>
    </JobSheet>
  );
}
