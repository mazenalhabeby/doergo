import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../contexts/theme-context';
import { Avatar } from './avatar';
import type { WorkerStatus, PersonTag, TagVariant } from './helpers';

export interface PersonNodeData {
  userId: string;
  initials: string;
  name: string;
  status: WorkerStatus;
  imageUrl?: string | null;
  tag?: PersonTag;
}

const TAG_COLORS: Record<TagVariant, { bg: string; fg: string }> = {
  task: { bg: 'rgba(59,130,246,0.18)', fg: '#60a5fa' },
  late: { bg: 'rgba(245,158,11,0.18)', fg: '#fbbf24' },
  miss: { bg: 'rgba(239,68,68,0.18)', fg: '#f87171' },
  hrs: { bg: 'rgba(139,92,246,0.18)', fg: '#a78bfa' },
};

interface Props {
  person: PersonNodeData;
  onPress?: (userId: string) => void;
}

export const PersonNode = React.memo(function PersonNode({ person, onPress }: Props) {
  const { colors } = useTheme();
  const tag = person.tag ? TAG_COLORS[person.tag.variant] : null;

  return (
    <TouchableOpacity
      style={styles.wrap}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress ? () => onPress(person.userId) : undefined}
      disabled={!onPress}
    >
      <Avatar
        id={person.userId}
        initials={person.initials}
        imageUrl={person.imageUrl}
        status={person.status}
        ringColor={colors.card}
        size={46}
      />
      <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
        {person.name}
      </Text>
      <View style={styles.tagSlot}>
        {tag && person.tag ? (
          <View style={[styles.tag, { backgroundColor: tag.bg }]}>
            <Text style={[styles.tagText, { color: tag.fg }]} numberOfLines={1}>
              {person.tag.text}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  wrap: { width: 62, alignItems: 'center', gap: 6 },
  name: { fontSize: 10, fontWeight: '500', textAlign: 'center', width: '100%' },
  tagSlot: { minHeight: 16, justifyContent: 'center' },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
});
