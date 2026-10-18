import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { adminInvitationsApi, locationsApi, type Invitation } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import {
  AText,
  GlassCard,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Sunken,
  Well,
  WellDivider,
  JobField,
  SectionLabel,
  ChoicePill,
} from '../amazen';
import { centeredContent } from '../screen-container';
import { JobSheet } from '../job/job-ui';
import { LoadingLine } from '../loading-line';
import { pullRefresh } from '../pull-refresh';

/**
 * INVITATIONS — make a code, share it, see what became of the ones sent.
 *
 * The code is a bearer credential (whoever has it joins — CLAUDE.md §3.4), so
 * a waiting one can be revoked from its row, and the list says when each one
 * stops working.
 *
 * ⚠️ NO "COPY" BUTTON — the phone carries no clipboard module, and a button
 * that only pretends is worse than none. Share offers Copy on both platforms,
 * and the code itself is selectable.
 */
export function InvitationsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [items, setItems] = useState<Invitation[] | null>(null);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [title, setTitle] = useState('');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [inv, locs] = await Promise.allSettled([adminInvitationsApi.list(), locationsApi.list()]);
    if (inv.status === 'fulfilled') setItems(inv.value);
    else {
      setItems((x) => x ?? []);
      toast.error(t('common.error'), t('manage.invitationsScreen.failedToLoad'));
    }
    if (locs.status === 'fulfilled') {
      setSpaces((locs.value as Array<{ id: string; name: string; isRemote?: boolean; isActive?: boolean }>)
        .filter((l) => !l.isRemote && l.isActive !== false).map((l) => ({ id: l.id, name: l.name })));
    }
  }, [toast, t]);
  useLiveRefresh(load, null);

  const now = Date.now();
  const groups = useMemo(() => {
    const list = items ?? [];
    const waiting = list.filter((x) => x.status === 'PENDING' && Date.parse(x.expiresAt) > now);
    const used = list.filter((x) => x.status === 'ACCEPTED');
    const closed = list.filter((x) => !waiting.includes(x) && !used.includes(x));
    return { waiting, used, closed };
  }, [items, now]);
  const spaceName = (id?: string | null) => spaces.find((s) => s.id === id)?.name;
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const expiresIn = (iso: string) => {
    const h = Math.max(0, Math.round((Date.parse(iso) - now) / 3_600_000));
    return h >= 48
      ? t('invites.expiresDays', { count: Math.round(h / 24), defaultValue: 'expires in {{count}} days' })
      : t('invites.expiresHours', { count: h, defaultValue: 'expires in {{count}} hours' });
  };
  const share = (code: string) => void Share.share({ message: t('manage.invitationsScreen.createModal.shareMessage', { code }) });

  const create = async () => {
    setCreating(true);
    try {
      // Invitations are for employees; what they may do is their role, set after they join.
      const res = await adminInvitationsApi.create({
        targetRole: 'EMPLOYEE',
        position: title.trim() || undefined,
        spaceId: spaceId || undefined,
        expiresInHours: 72,
      });
      setMade(res.code);
      setTitle('');
      await load();
    } catch (e) {
      toast.error(t('common.error'), (e as Error)?.message || t('manage.invitationsScreen.failedToCreate'));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await adminInvitationsApi.revoke(revoking.id);
      setRevoking(null);
      await load();
    } catch (e) {
      toast.error(t('common.error'), (e as Error)?.message || t('manage.invitationsScreen.failedToRevoke'));
    } finally {
      setBusy(false);
    }
  };

  const section = (label: string, list: Invitation[], row: (x: Invitation) => React.ReactNode) => (list.length ? (
    <View style={{ gap: amazen.space(2) }}>
      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{`${label} · ${list.length}`}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {list.map((x, i) => <React.Fragment key={x.id}>{i > 0 ? <WellDivider /> : null}{row(x)}</React.Fragment>)}
      </Well>
    </View>
  ) : null);

  const codeRow = (x: Invitation, tone: 'live' | 'dead', sub: string, right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3) }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: tone === 'live' ? c.accentTint : c.tile,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <AText style={{ fontFamily: amazen.font.mono, fontSize: 15, color: tone === 'live' ? c.accent : c.inkMuted }}>#</AText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText
          numeric
          selectable
          numberOfLines={1}
          style={{
            fontFamily: amazen.font.mono,
            fontSize: 14.5,
            letterSpacing: 1.5,
            color: tone === 'live' ? c.inkStrong : c.inkMuted,
          }}
        >
          {x.code ?? '••••••••••'}
        </AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>{sub}</AText>
      </View>
      {right}
    </View>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('manage.invitations.label', 'Invitations')}
        leading={<HeaderBack onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href))} />}
        style={wide ?? undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={
          pullRefresh({ refreshing, setRefreshing, load, color: c.accent })
        }
      >
        <GlassCard style={{ gap: amazen.space(2.5) }}>
          <AText variant="body" tone="strong" style={{ fontSize: 15.5 }}>{t('invites.inviteSomeone', 'Invite someone')}</AText>
          <JobField value={title} onChangeText={setTitle} placeholder={t('invites.jobTitle', 'Job title (optional)')} maxLength={80} />
          {spaces.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: amazen.space(1.5) }}
              keyboardShouldPersistTaps="handled">
              {[
                { id: null as string | null, name: t('manage.invitationsScreen.createModal.noSpace', 'No workspace') },
                ...spaces,
              ].map((s) => {
                const on = spaceId === s.id;
                return (
                  <ChoicePill key={s.id ?? 'none'} label={s.name} on={on} onPress={() => setSpaceId(s.id)} truncate />
                );
              })}
            </ScrollView>
          ) : null}
          <PrimaryButton label={t('invites.createCode', 'Create a code')} onPress={() => void create()} loading={creating} />
        </GlassCard>

        {items === null ? (
          <LoadingLine onGlass padUnits={6} />
        ) : !items.length ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(4) }}>
            {t('manage.invitationsScreen.noInvitations')}
          </AText>
        ) : (
          <>
            {section(t('invites.waiting', 'Waiting'), groups.waiting, (x) => codeRow(x, 'live',
              [x.position, spaceName(x.spaceId), expiresIn(x.expiresAt)].filter(Boolean).join(' · '),
              <Pressable onPress={() => setRevoking(x)} hitSlop={8} accessibilityRole="button">
                <AText variant="caption" tone="critical" style={{ fontSize: 13 }}>{t('common.revoke', 'Revoke')}</AText>
              </Pressable>,
            ))}
            {section(t('invites.used', 'Used'), groups.used, (x) => codeRow(x, 'dead',
              [
                t('invites.usedOn', { defaultValue: 'Used {{date}}', date: date(x.usedAt ?? x.createdAt) }),
                x.position,
                spaceName(x.spaceId),
              ]
                .filter(Boolean)
                .join(' · ')))}
            {section(t('invites.closed', 'Revoked or expired'), groups.closed, (x) => codeRow(x, 'dead',
              [
                x.status === 'REVOKED'
                  ? t('invites.revoked', 'Revoked')
                  : t('invites.expired', { defaultValue: 'Expired {{date}}', date: date(x.expiresAt) }),
                x.position,
              ]
                .filter(Boolean)
                .join(' · ')))}
          </>
        )}
      </ScrollView>

      <JobSheet visible={!!made} onClose={() => setMade(null)} title={t('invites.hereIsCode', 'Here is the code')}>
        {made ? (
          <>
            <Sunken style={{ paddingVertical: amazen.space(5), alignItems: 'center' }}>
              <AText
                selectable
                numeric
                style={{ fontFamily: amazen.font.mono, fontSize: 30, letterSpacing: 5, color: c.inkStrong }}
              >
                {made}
              </AText>
            </Sunken>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              {t('invites.validFor', 'Valid for 3 days · one person can use it')}
            </AText>
            <PrimaryButton label={t('joinRequests.share', 'Share')} onPress={() => share(made)} />
            <Pressable onPress={() => setMade(null)} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
              <AText variant="body" tone="muted" style={{ fontSize: 14 }}>{t('common.done', 'Done')}</AText>
            </Pressable>
          </>
        ) : null}
      </JobSheet>

      <JobSheet
        visible={!!revoking}
        onClose={() => setRevoking(null)}
        busy={busy}
        title={t('manage.invitationsScreen.revokeTitle', 'Revoke this code?')}>
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
          {t('invites.revokeBody', 'Nobody will be able to join with it. People who already joined stay.')}
        </AText>
        <PrimaryButton label={t('invites.keep', 'Keep it')} onPress={() => setRevoking(null)} />
        <Pressable
          onPress={() => void revoke()}
          disabled={busy}
          accessibilityRole="button"
          style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 14.5 }}>{t('common.revoke', 'Revoke')}</AText>
        </Pressable>
      </JobSheet>
    </Ground>
  );
}
