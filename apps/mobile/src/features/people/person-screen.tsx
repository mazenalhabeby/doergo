import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { personName, chatPresenceLabel } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { chatApi } from '../../lib/api';
import { tabAccessFor } from '../../lib/tab-layout';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well, WellDivider, Banner } from '../../components/amazen';
import { PersonAvatar } from './person-avatar';
import { LoadingLine } from '../../components/loading-line';

type Person = Awaited<ReturnType<typeof chatApi.person>> & { spaceName?: string | null };

/**
 * One colleague, as Team shows them: photo, job, whether they are around,
 * where they work — and Message when chat's rule allows it. Built by the
 * server from the caller's own Team lists (GET /people/:id), so it never shows
 * somebody, or something, Team would not; anybody else is "not on your team".
 */
export function PersonScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { amazen } = useTheme();
  const router = useRouter();
  const canChat = useMemo(() => tabAccessFor(user as never).chat, [user]);
  const [person, setPerson] = useState<Person | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    chatApi
      .person(id)
      .then((p) => setPerson(p as Person))
      .catch(() => setMissing(true));
  }, [id]);

  const facts = person
    ? ([
        [t('chat.status', 'Status'), chatPresenceLabel(person.presence, t)],
        person.position ? [t('people.job', 'Job'), person.position] : null,
        person.workspaces?.length ? [t('chat.workspaces', 'Workspaces'), person.workspaces.join(' · ')] : null,
      ].filter(Boolean) as [string, string][])
    : [];

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title=""
        leading={
          <HeaderBack
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/team' as never))}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: amazen.space(4),
          paddingBottom: amazen.space(10),
          gap: amazen.space(4),
        }}
      >
        {missing ? (
          <Banner tone="critical" text={t('team.notVisible', 'This person is not on your team.')} />
        ) : !person ? (
          <LoadingLine onGlass padUnits={8} />
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: amazen.space(2) }}>
              <PersonAvatar person={person} size={84} presence={person.presence ?? null} />
              <AText variant="h2" tone="strong" style={{ textAlign: 'center' }}>
                {personName(person)}
              </AText>
            </View>
            <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
              {facts.map(([label, value], i) => (
                <View key={label}>
                  {i ? <WellDivider /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: amazen.space(3),
                      paddingVertical: amazen.space(3),
                    }}
                  >
                    <AText variant="caption" tone="muted">
                      {label}
                    </AText>
                    <AText variant="body" tone="strong" style={{ flexShrink: 1, textAlign: 'right' }}>
                      {value}
                    </AText>
                  </View>
                </View>
              ))}
            </Well>
            {canChat && person.canMessage ? (
              <PrimaryButton
                label={t('chat.message', 'Message')}
                onPress={() => router.push({ pathname: '/chat', params: { userId: person.id } } as never)}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </Ground>
  );
}
