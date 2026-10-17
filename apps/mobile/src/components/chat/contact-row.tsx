import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { personName, type ChatUserRef } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, WellDivider } from '../amazen';
import { InkIcon } from '../amazen/ink-icon';
import { Arrive } from '../amazen/motion';
import { PersonAvatar } from '../people/person-avatar';
import { Tag } from './chat-rows-shared';

/** ContactRow, moved here unchanged out of chat-rows.tsx. */
export const ContactRow = memo(function ContactRow({
  person: u,
  first,
  last,
  onPick,
  selected,
  trailing,
}: {
  person: ChatUserRef;
  first: boolean;
  last: boolean;
  onPick: (id: string) => void;
  /** Picking several (a group): drawn as a check. */
  selected?: boolean;
  /** A word on the right ("Manages the group"). */
  trailing?: string | null;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  const r = amazen.radius.panel;
  return (
    <View
      style={{
        backgroundColor: c.well,
        paddingHorizontal: amazen.space(3.5),
        borderTopLeftRadius: first ? r : 0,
        borderTopRightRadius: first ? r : 0,
        borderBottomLeftRadius: last ? r : 0,
        borderBottomRightRadius: last ? r : 0,
      }}>
      {first ? null : <WellDivider />}
      <Pressable
        onPress={() => onPick(u.id)}
        accessibilityRole={selected !== undefined ? 'checkbox' : 'button'}
        accessibilityState={selected !== undefined ? { checked: selected } : undefined}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
          paddingVertical: amazen.space(2.75),
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <PersonAvatar person={u} presence={u.presence ?? null} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>{personName(u)}</AText>
          {u.isExternal ? <Tag label={t('chat.external', 'External')} tone="warn" /> : null}
        </View>
        {trailing ? (
          <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11.5 }}>
            {trailing}
          </AText>
        ) : null}
        {selected !== undefined ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: selected ? 0 : 1.5,
              borderColor: c.lineWell,
              backgroundColor: selected ? c.accentSolid : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? (
              <Arrive kind="pop">
                <InkIcon name="check" size={16} flat color={c.accentInk} />
              </Arrive>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});
