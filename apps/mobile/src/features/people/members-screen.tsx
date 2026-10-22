import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { useResponsive } from '../../lib/responsive';
import {
  AText,
  GlassInput,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Sunken,
  Well,
  WellDivider,
  Banner,
} from '../../components/amazen';
import { centeredContent } from '../../components/screen-container';
import { JobSheet } from '../job/job-ui';
import { timeAgo } from '../team/helpers';
import { PersonAvatar } from './person-avatar';
import { personName } from '@hbcfield/shared/client';
import { useMembersScreen } from './use-members-screen';
import { RoleTag } from './members-screen-helpers';
import { FactRow } from '../../components/amazen/fact-row';
import { LoadingLine } from '../../components/loading-line';
import { refreshControl } from '../../components/pull-refresh';

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
  const {
    amazen,
    c,
    t,
    user,
    wide,
    members,
    query,
    setQuery,
    filter,
    setFilter,
    open,
    setOpen,
    confirmRemove,
    setConfirmRemove,
    busy,
    refreshing,
    refresh,
    list,
    roles,
    noRole,
    external,
    shown,
    remove,
    chip,
  } = useMembersScreen();

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('manage.members.label', 'Members')}
        leading={
          <HeaderBack
            onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href))}
          />
        }
        actions={[
          {
            label: `＋ ${t('members.invite', 'Invite')}`,
            a11yLabel: t('members.invite', 'Invite'),
            onPress: () => router.push('/(app)/manage/invitations' as Href),
          },
        ]}
        style={wide ?? undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          { paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) },
          wide,
        ]}
        refreshControl={refreshControl({ refreshing, onRefresh: () => void refresh(), color: c.accent })}
      >
        <GlassInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('members.search', 'Search by name or email')}
          autoCapitalize="none"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: amazen.space(1.5) }}
        >
          {chip(
            'all',
            t('members.all', { count: list.length, defaultValue: 'All {{count}}' }),
            filter.kind === 'all',
            () => setFilter({ kind: 'all' }),
          )}
          {roles.map((ro) =>
            chip(
              ro.id,
              `${ro.name} ${ro.n}`,
              filter.kind === 'role' && filter.id === ro.id,
              () => setFilter({ kind: 'role', id: ro.id }),
              ro.color,
            ),
          )}
          {noRole
            ? chip(
                'none',
                t('members.noRole', { count: noRole, defaultValue: 'No role {{count}}' }),
                filter.kind === 'none',
                () => setFilter({ kind: 'none' }),
              )
            : null}
          {external
            ? chip(
                'ext',
                t('members.external', { count: external, defaultValue: 'External {{count}}' }),
                filter.kind === 'external',
                () => setFilter({ kind: 'external' }),
              )
            : null}
        </ScrollView>

        {members === null ? (
          <LoadingLine onGlass padUnits={6} />
        ) : shown.length === 0 ? (
          <Well style={{ padding: amazen.space(5) }}>
            <AText variant="body" tone="ink">
              {list.length ? t('members.noMatch', 'Nobody matches.') : t('manage.membersScreen.noMembers')}
            </AText>
          </Well>
        ) : (
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {shown.map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 ? <WellDivider /> : null}
                <Pressable
                  onPress={() => {
                    setOpen(m);
                    setConfirmRemove(false);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: amazen.space(3),
                    paddingVertical: amazen.space(2.75),
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <PersonAvatar person={m} presence={m.presence ?? null} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>
                        {personName(m)}
                      </AText>
                      {m.id === user?.id ? (
                        <AText style={{ fontFamily: amazen.font.mono, fontSize: 10, color: c.accent }}>
                          {t('manage.membersScreen.you', 'You').toUpperCase()}
                        </AText>
                      ) : null}
                    </View>
                    <AText variant="caption" tone="muted" numberOfLines={1}>
                      {[
                        m.position,
                        m.lastActiveAt
                          ? t('members.active', { defaultValue: 'active {{when}}', when: timeAgo(m.lastActiveAt) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </AText>
                  </View>
                  <RoleTag member={m} />
                  <AText variant="body" tone="muted">
                    ›
                  </AText>
                </Pressable>
              </React.Fragment>
            ))}
          </Well>
        )}
      </ScrollView>

      <JobSheet visible={!!open} onClose={() => setOpen(null)} busy={busy} title={open ? personName(open) : undefined}>
        {open ? (
          <>
            <Sunken style={{ paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1) }}>
              <FactRow first label={t('members.email', 'Email')} value={open.email} />
              <FactRow
                label={t('members.role', 'Role')}
                value={
                  open.isExternal
                    ? t('members.externalOne', 'External')
                    : (open.memberRole?.name ?? t('members.noRoleOne', 'No role'))
                }
              />
              {open.position ? <FactRow label={t('members.position', 'Position')} value={open.position} /> : null}
              {open.lastActiveAt ? (
                <FactRow label={t('members.lastActive', 'Last active')} value={timeAgo(open.lastActiveAt)} />
              ) : null}
            </Sunken>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              {t('members.changeOnWeb', 'Change roles and access on the web.')}
            </AText>
            {confirmRemove ? (
              <Banner tone="critical" text={t('manage.membersScreen.removeMessage', { name: personName(open) })} />
            ) : null}
            <PrimaryButton
              label={confirmRemove ? t('common.cancel', 'Cancel') : t('common.done', 'Done')}
              onPress={() => (confirmRemove ? setConfirmRemove(false) : setOpen(null))}
            />
            {open.id !== user?.id ? (
              <Pressable
                onPress={() => (confirmRemove ? void remove() : setConfirmRemove(true))}
                disabled={busy}
                accessibilityRole="button"
                style={{ alignSelf: 'center', padding: amazen.space(2) }}
              >
                <AText variant="body" tone="critical" style={{ fontSize: 14.5 }}>
                  {confirmRemove
                    ? t('members.removeConfirm', 'Yes, remove them')
                    : t('members.remove', 'Remove from the organization')}
                </AText>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </JobSheet>
    </Ground>
  );
}
