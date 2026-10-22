import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CHAT_GROUP_MAX_MEMBERS,
  CHAT_GROUP_TITLE_MAX,
  parseGroupTitle,
  type ChatConversation,
  type ChatUserRef,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { chatApi } from '@/lib/api';
import { AText, GlassInput, PrimaryButton, useTabSafe, Banner, SectionLabel } from '@/components/amazen';
import { ContactRow } from './chat-rows';
import { Arrive } from '@/components/amazen/motion';

/** Toggle one id in a set, kept under the group's size. */
export function toggled(set: ReadonlySet<string>, id: string, room: number): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else if (next.size < room) next.add(id);
  return next;
}

/**
 * People to pick several of: only those the server says the caller may
 * message, never another company's (a group is one company's), and not those
 * already in it.
 */
export function PickPeople({
  selected,
  onToggle,
  exclude,
  header,
}: {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  exclude?: ReadonlySet<string>;
  header: React.ReactElement;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const tabSafe = useTabSafe();
  const [people, setPeople] = useState<ChatUserRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    chatApi
      .contacts()
      .then(setPeople)
      .catch(() => {
        setPeople([]);
        setError(t('chat.loadError', 'Could not load messages.'));
      });
  }, [t]);
  const shown = useMemo(() => (people ?? []).filter((u) => !u.isExternal && !exclude?.has(u.id)), [people, exclude]);
  return (
    <FlatList
      data={shown}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe }}
      ListHeaderComponent={
        <View style={{ gap: amazen.space(3), marginBottom: amazen.space(3) }}>
          {header}
          {error ? <Banner tone="critical" text={error} /> : null}
        </View>
      }
      ListEmptyComponent={
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>
          {people === null ? t('common.loading', 'Loading…') : t('chat.noContacts', 'Nobody to message yet.')}
        </AText>
      }
      renderItem={({ item, index }) => (
        // People come in one after another — the first screenful only.
        <Arrive enabled={index < 12} delay={Math.min(index, 12) * 30}>
          <ContactRow
            person={item}
            first={index === 0}
            last={index === shown.length - 1}
            selected={selected.has(item.id)}
            onPick={onToggle}
          />
        </Arrive>
      )}
    />
  );
}

/** Start a group: a name and the people in it (managers and leaders only — the screen that opens this asks first). */
export function GroupCreateView({ onCreated }: { onCreated: (c: ChatConversation) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const ready = !!parseGroupTitle(title) && picked.size > 0 && !busy;
  const create = async () => {
    setBusy(true);
    try {
      onCreated(await chatApi.createGroup(parseGroupTitle(title)!, [...picked]));
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PickPeople
      selected={picked}
      onToggle={(id) => setPicked((s) => toggled(s, id, CHAT_GROUP_MAX_MEMBERS - 1))}
      header={
        <>
          <GlassInput
            value={title}
            onChangeText={setTitle}
            maxLength={CHAT_GROUP_TITLE_MAX}
            placeholder={t('chat.groupName', 'Group name')}
            accessibilityLabel={t('chat.groupName', 'Group name')}
          />
          <PrimaryButton
            label={t('chat.createGroup', { count: picked.size, defaultValue: 'Create ({{count}})' })}
            onPress={create}
            disabled={!ready}
            loading={busy}
          />
          <SectionLabel>{t('chat.addPeople', 'Add people')}</SectionLabel>
        </>
      }
    />
  );
}

/** Add people to a group (its creator, or a manager). */
export function AddPeopleView({
  conversation,
  onDone,
}: {
  conversation: ChatConversation;
  onDone: (c: ChatConversation) => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const inIt = useMemo(() => new Set((conversation.members ?? []).map((m) => m.id)), [conversation.members]);
  const add = async () => {
    setBusy(true);
    try {
      onDone(await chatApi.addMembers(conversation.id, [...picked]));
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PickPeople
      selected={picked}
      exclude={inIt}
      onToggle={(id) => setPicked((s) => toggled(s, id, CHAT_GROUP_MAX_MEMBERS - inIt.size))}
      header={
        <PrimaryButton
          label={t('chat.addCount', { count: picked.size, defaultValue: 'Add ({{count}})' })}
          onPress={add}
          disabled={!picked.size || busy}
          loading={busy}
        />
      }
    />
  );
}
