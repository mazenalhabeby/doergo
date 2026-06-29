import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { COLORS } from '../../../lib/constants';
import { locationsApi, type OrgMember } from '../../../lib/api';
import { BottomSheet } from './bottom-sheet';
import { Avatar } from './avatar';
import { getInitials, shortName } from './helpers';

interface Props {
  visible: boolean;
  locationId: string | null;
  locationName?: string;
  members: OrgMember[];
  assignedUserIds: Set<string>;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignMemberSheet({
  visible,
  locationId,
  locationName,
  members,
  assignedUserIds,
  onClose,
  onAssigned,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSearch('');
      setAssigningId(null);
    }
  }, [visible]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => m.isActive && !assignedUserIds.has(m.id))
      .filter((m) => (!q ? true : `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(q)));
  }, [members, assignedUserIds, search]);

  const handleAssign = async (userId: string) => {
    if (!locationId || assigningId) return;
    try {
      setAssigningId(userId);
      await locationsApi.assignMember(locationId, { userId });
      onAssigned();
      onClose();
    } catch {
      setAssigningId(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} heightRatio={0.78}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('components.assignMemberSheet.title')}</Text>
          {!!locationName && (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {t('components.assignMemberSheet.toLocation', { location: locationName })}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.input, borderColor: colors.inputBorder }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={t('components.assignMemberSheet.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {available.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {members.length === 0
              ? t('components.assignMemberSheet.noMembers')
              : t('components.assignMemberSheet.allAssigned')}
          </Text>
        ) : (
          available.map((m) => {
            const busy = assigningId === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => handleAssign(m.id)}
                disabled={!!assigningId}
                activeOpacity={0.7}
              >
                <Avatar id={m.id} initials={getInitials(m.firstName, m.lastName)} imageUrl={m.avatarUrl} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {shortName(m.firstName, m.lastName)}
                  </Text>
                  <Text style={[styles.email, { color: colors.textMuted }]} numberOfLines={1}>
                    {m.position || m.role}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
  name: { fontSize: 14, fontWeight: '600' },
  email: { fontSize: 11, marginTop: 1 },
});
