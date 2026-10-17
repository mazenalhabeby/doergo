import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  CHAT_GROUP_MAX_MEMBERS,
  CHAT_GROUP_TITLE_MAX,
  conversationTitle,
  parseGroupTitle,
  personName,
  type ChatConversation,
  type ChatUserRef,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { chatApi } from '../../lib/api';
import { AText, GhostButton, GlassInput, PrimaryButton, useTabSafe, Banner, SectionLabel } from '../amazen';
import { ContactRow, ConversationAvatar } from './chat-rows';
import { Arrive } from '../amazen/motion';
export { GroupCreateView, AddPeopleView } from './pick-people';

/**
 * A group or a job's chat, about itself: who is in it; for whoever may manage
 * the group — rename, add, take out; anybody may leave a group. A job's chat
 * follows its crew, so it links to the job instead.
 */
export function GroupInfoView({
  conversation,
  meId,
  onChanged,
  onLeft,
  onAdd,
}: {
  conversation: ChatConversation;
  meId?: string;
  onChanged: (c: ChatConversation) => void;
  onLeft: () => void;
  onAdd: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { amazen } = useTheme();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const [title, setTitle] = useState<string | null>(null);
  const isGroup = conversation.type === 'GROUP';
  const manage = isGroup && !!conversation.canManage;
  const members = conversation.members ?? [];
  const fail = (e: unknown) => Alert.alert(t('common.error', 'Error'), (e as Error).message);

  const rename = () => {
    const v = parseGroupTitle(title);
    if (!v) return;
    chatApi
      .renameGroup(conversation.id, v)
      .then((c) => {
        onChanged(c);
        setTitle(null);
      })
      .catch(fail);
  };
  const askRemove = (u: ChatUserRef) =>
    Alert.alert(
      t('chat.removeMemberAsk', { name: personName(u), defaultValue: 'Take {{name}} out of this group?' }),
      undefined,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('chat.removeMember', 'Take out'),
          style: 'destructive',
          onPress: () => void chatApi.removeMember(conversation.id, u.id).then(onChanged).catch(fail),
        },
      ],
    );
  const askLeave = () =>
    Alert.alert(t('chat.leaveAsk', 'Leave this group? You will no longer see its messages.'), undefined, [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('chat.leave', 'Leave'),
        style: 'destructive',
        onPress: () => void chatApi.leaveGroup(conversation.id).then(onLeft).catch(fail),
      },
    ]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }}
    >
      <View style={{ alignItems: 'center', gap: amazen.space(2), paddingVertical: amazen.space(3) }}>
        <ConversationAvatar conv={conversation} size={72} />
        {title !== null ? (
          <View style={{ alignSelf: 'stretch', gap: amazen.space(2) }}>
            <GlassInput
              value={title}
              onChangeText={setTitle}
              maxLength={CHAT_GROUP_TITLE_MAX}
              autoFocus
              accessibilityLabel={t('chat.groupName', 'Group name')}
            />
            <View style={{ flexDirection: 'row', gap: amazen.space(2), justifyContent: 'center' }}>
              <GhostButton label={t('common.cancel', 'Cancel')} onPress={() => setTitle(null)} />
              <PrimaryButton label={t('common.save', 'Save')} onPress={rename} disabled={!parseGroupTitle(title)} />
            </View>
          </View>
        ) : (
          <AText variant="h3" tone="strong" style={{ textAlign: 'center' }}>
            {conversationTitle(conversation, i18n.language)}
          </AText>
        )}
        <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {conversation.type === 'TASK'
            ? t('chat.taskChatNote', "Everyone on this job's crew is in this chat.")
            : t('chat.peopleCount', { count: members.length, defaultValue: '{{count}} people' })}
        </AText>
        {manage && title === null ? (
          <GhostButton
            label={t('chat.rename', 'Rename')}
            tone="accent"
            onPress={() => setTitle(conversation.title ?? '')}
          />
        ) : null}
        {conversation.type === 'TASK' && conversation.task ? (
          <GhostButton
            label={t('chat.openJob', 'Open the job')}
            tone="accent"
            onPress={() =>
              router.push({ pathname: '/(app)/task/[id]', params: { id: conversation.task!.id } } as never)
            }
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>{t('chat.members', 'Members')}</SectionLabel>
        {manage ? (
          <GhostButton label={`＋ ${t('chat.addPeople', 'Add people')}`} tone="accent" onPress={onAdd} />
        ) : null}
      </View>
      <View>
        {members.map((u, i) => (
          <Arrive key={u.id} delay={Math.min(i, 12) * 30}>
            <ContactRow
              person={{
                ...u,
                firstName: u.id === meId ? t('chat.you', 'You') : u.firstName,
                lastName: u.id === meId ? '' : u.lastName,
              }}
              first={i === 0}
              last={i === members.length - 1}
              trailing={isGroup && u.id === conversation.createdById ? t('chat.groupOwner', 'Manages the group') : null}
              onPick={() => {
                if (manage && u.id !== meId) askRemove(u);
              }}
            />
          </Arrive>
        ))}
      </View>
      {manage ? (
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
          {t('chat.tapToRemove', 'Tap a person to take them out.')}
        </AText>
      ) : null}
      {isGroup ? (
        <GhostButton label={t('chat.leaveGroup', 'Leave the group')} tone="critical" onPress={askLeave} />
      ) : null}
    </ScrollView>
  );
}
