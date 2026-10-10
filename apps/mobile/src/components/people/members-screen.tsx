import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { membersApi, type OrgMember } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Sunken, Well, WellDivider } from '../amazen';
import { centeredContent } from '../screen-container';
import { Banner, JobSheet } from '../job/job-ui';
import { timeAgo } from '../team/helpers';
import { PersonAvatar } from './person-avatar';
import { personName } from '@hbcfield/shared/client';

type Filter = { kind: 'all' } | { kind: 'role'; id: string } | { kind: 'none' } | { kind: 'external' };

/**
 * MEMBERS — everyone in the organization, filtered by the organization's OWN roles.
 *
 * ⚠️ THE OLD CHIPS NAMED ROLES THAT NO LONGER EXIST (Admin / Dispatcher /
 * Technician, read off `User.role`). A member's authority is their
 * `memberRole` — a named, coloured role the organization defines — so the
 * chips are built from the roles actually held, with their counts.
 *
 * ⚠️ CHANGING A ROLE STAYS ON THE WEB, where the role editor shows what each
 * one grants. Removing a member is here, asked once, and never yourself.
 */
export function MembersScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [open, setOpen] = useState<OrgMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await membersApi.list());
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 401) return;
      setMembers((m) => m ?? []);
      toast.error(t('common.error'), (err as Error)?.message || t('manage.membersScreen.failedToLoad'));
    }
  }, [toast, t]);
  useLiveRefresh(load, null);

  const list = members ?? [];
  // The roles actually held, in the order of how many hold them.
  const roles = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color?: string | null; n: number }>();
    for (const x of list) if (x.memberRole && !x.isExternal) {
      const e = m.get(x.memberRole.id) ?? { ...x.memberRole, n: 0 };
      e.n++;
      m.set(x.memberRole.id, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [list]);
  const noRole = list.filter((x) => !x.memberRole && !x.isExternal).length;
  const external = list.filter((x) => x.isExternal).length;

  const q = query.trim().toLowerCase();
  const shown = list.filter((x) =>
    (filter.kind === 'all'
      || (filter.kind === 'role' && x.memberRole?.id === filter.id && !x.isExternal)
      || (filter.kind === 'none' && !x.memberRole && !x.isExternal)
      || (filter.kind === 'external' && !!x.isExternal))
    && (!q || `${personName(x)} ${x.email}`.toLowerCase().includes(q)),
  ).sort((a, b) => personName(a).localeCompare(personName(b)));

  const remove = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await membersApi.remove(open.id);
      setOpen(null);
      setConfirmRemove(false);
      await load();
    } catch (err: unknown) {
      toast.error(t('common.error'), (err as Error)?.message || t('manage.membersScreen.failedToRemove'));
    } finally {
      setBusy(false);
    }
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void, dot?: string | null) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.75), backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <AText variant="caption" style={{ fontSize: 12.5, color: on ? c.accent : c.ink }}>{label}</AText>
    </Pressable>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('manage.members.label', 'Members')}
        leading={<HeaderBack onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href))} />}
        actions={[{ label: `＋ ${t('members.invite', 'Invite')}`, a11yLabel: t('members.invite', 'Invite'), onPress: () => router.push('/(app)/manage/invitations' as Href) }]}
        style={wide ?? undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('members.search', 'Search by name or email')}
          placeholderTextColor={c.inkOnGlass}
          autoCapitalize="none"
          style={{ backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass, borderRadius: 16, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3), color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14 }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }}>
          {chip('all', t('members.all', { count: list.length, defaultValue: 'All {{count}}' }), filter.kind === 'all', () => setFilter({ kind: 'all' }))}
          {roles.map((ro) => chip(ro.id, `${ro.name} ${ro.n}`, filter.kind === 'role' && filter.id === ro.id, () => setFilter({ kind: 'role', id: ro.id }), ro.color))}
          {noRole ? chip('none', t('members.noRole', { count: noRole, defaultValue: 'No role {{count}}' }), filter.kind === 'none', () => setFilter({ kind: 'none' })) : null}
          {external ? chip('ext', t('members.external', { count: external, defaultValue: 'External {{count}}' }), filter.kind === 'external', () => setFilter({ kind: 'external' })) : null}
        </ScrollView>

        {members === null ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('common.loading', 'Loading…')}</AText>
        ) : shown.length === 0 ? (
          <Well style={{ padding: amazen.space(5) }}><AText variant="body" tone="ink">{list.length ? t('members.noMatch', 'Nobody matches.') : t('manage.membersScreen.noMembers')}</AText></Well>
        ) : (
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {shown.map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 ? <WellDivider /> : null}
                <Pressable onPress={() => { setOpen(m); setConfirmRemove(false); }} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), opacity: pressed ? 0.85 : 1 })}>
                  <PersonAvatar person={m} presence={m.presence ?? null} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>{personName(m)}</AText>
                      {m.id === user?.id ? <AText style={{ fontFamily: amazen.font.mono, fontSize: 10, color: c.accent }}>{t('manage.membersScreen.you', 'You').toUpperCase()}</AText> : null}
                    </View>
                    <AText variant="caption" tone="muted" numberOfLines={1}>
                      {[m.position, m.lastActiveAt ? t('members.active', { defaultValue: 'active {{when}}', when: timeAgo(m.lastActiveAt) }) : null].filter(Boolean).join(' · ')}
                    </AText>
                  </View>
                  <RoleTag member={m} />
                  <AText variant="body" tone="muted">›</AText>
                </Pressable>
              </React.Fragment>
            ))}
          </Well>
        )}
      </ScrollView>

      <JobSheet visible={!!open} onClose={() => setOpen(null)} busy={busy} title={open ? personName(open) : undefined}>
        {open ? (
          <>
            <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
              <Line label={t('members.email', 'Email')} value={open.email} />
              <Line label={t('members.role', 'Role')} value={open.isExternal ? t('members.externalOne', 'External') : open.memberRole?.name ?? t('members.noRoleOne', 'No role')} />
              {open.position ? <Line label={t('members.position', 'Position')} value={open.position} /> : null}
              {open.lastActiveAt ? <Line label={t('members.lastActive', 'Last active')} value={timeAgo(open.lastActiveAt)} /> : null}
            </Sunken>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{t('members.changeOnWeb', 'Change roles and access on the web.')}</AText>
            {confirmRemove ? <Banner tone="critical" text={t('manage.membersScreen.removeMessage', { name: personName(open) })} /> : null}
            <PrimaryButton label={confirmRemove ? t('common.cancel', 'Cancel') : t('common.done', 'Done')} onPress={() => (confirmRemove ? setConfirmRemove(false) : setOpen(null))} />
            {open.id !== user?.id ? (
              <Pressable onPress={() => (confirmRemove ? void remove() : setConfirmRemove(true))} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
                <AText variant="body" tone="critical" style={{ fontSize: 14.5 }}>
                  {confirmRemove ? t('members.removeConfirm', 'Yes, remove them') : t('members.remove', 'Remove from the organization')}
                </AText>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </JobSheet>
    </Ground>
  );
}

function RoleTag({ member }: { member: OrgMember }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const ext = !!member.isExternal;
  const label = ext ? t('members.externalOne', 'External') : member.memberRole?.name ?? t('members.noRoleOne', 'No role');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: ext ? c.warnTint : c.tile, opacity: !ext && !member.memberRole ? 0.6 : 1, maxWidth: 110 }}>
      {!ext && member.memberRole?.color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: member.memberRole.color }} /> : null}
      <AText numberOfLines={1} style={{ fontFamily: amazen.font.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: ext ? c.warn : c.ink }}>{label}</AText>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{label}</AText>
      <AText variant="caption" tone="ink" numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1, textAlign: 'right' }}>{value}</AText>
    </View>
  );
}
