/**
 * TechnicianPicker - Modal for selecting a technician
 * Used in Create Task and Task Detail (assign) screens
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { techniciansApi, type TechnicianListItem } from '../lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../lib/constants';
import { useTheme } from '../contexts/theme-context';

interface TechnicianPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (technician: TechnicianListItem) => void;
  selectedId?: string;
}

export function TechnicianPicker({
  visible,
  onClose,
  onSelect,
  selectedId,
}: TechnicianPickerProps) {
  const { colors } = useTheme();
  const [technicians, setTechnicians] = useState<TechnicianListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchTechnicians = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await techniciansApi.list({ status: 'active', limit: 50 });
      // fetchWithAuth unwraps { data: T } → T, so result may already be the array
      const all = Array.isArray(result) ? result : (result as any)?.data || [];
      // Filter out ON_SITE-only workers — they can't be assigned to field tasks
      const list = all.filter((t: TechnicianListItem) => t.workMode !== 'ON_SITE');
      setTechnicians(list);
      if (list.length === 0 && all.length > 0) {
        setError('No field technicians available (on-site workers cannot be assigned tasks)');
      } else if (list.length === 0) {
        setError('No technicians found in your organization');
      }
    } catch (err: any) {
      console.error('Failed to load technicians:', err);
      setError(err?.message || 'Failed to load technicians');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setSearch('');
      fetchTechnicians();
    }
  }, [visible, fetchTechnicians]);

  const filtered = search.trim()
    ? technicians.filter((t) => {
        const name = `${t.firstName} ${t.lastName}`.toLowerCase();
        return name.includes(search.toLowerCase());
      })
    : technicians;

  const renderItem = ({ item }: { item: TechnicianListItem }) => {
    const isSelected = item.id === selectedId;
    return (
      <TouchableOpacity
        style={[styles.technicianRow, isSelected && [styles.technicianRowSelected, { backgroundColor: colors.primaryLight }]]}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }, isSelected && styles.avatarSelected]}>
          <Text style={[styles.avatarText, { color: colors.textSecondary }, isSelected && styles.avatarTextSelected]}>
            {item.firstName[0]}{item.lastName[0]}
          </Text>
        </View>
        <View style={styles.technicianInfo}>
          <Text style={[styles.technicianName, { color: colors.textPrimary }]}>
            {item.firstName} {item.lastName}
          </Text>
          <View style={styles.technicianMeta}>
            {item.specialty && (
              <Text style={[styles.specialty, { color: colors.textSecondary }]}>{item.specialty}</Text>
            )}
            <Text style={[styles.taskCount, { color: colors.textMuted }]}>
              {item.currentTaskCount ?? 0} active tasks
            </Text>
          </View>
        </View>
        {item.isOnline && (
          <View style={styles.onlineDot} />
        )}
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.content, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Select Technician</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search by name..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name={error ? 'alert-circle-outline' : 'people-outline'} size={40} color={error ? COLORS.error : colors.textMuted} />
                  <Text style={[styles.emptyText, { color: error ? colors.textSecondary : colors.textMuted }]}>
                    {error || (search ? 'No technicians match your search' : 'No technicians available')}
                  </Text>
                  {error && (
                    <TouchableOpacity onPress={fetchTechnicians} style={styles.retryBtn}>
                      <Ionicons name="refresh" size={16} color={COLORS.primary} />
                      <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}
        </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.base,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  loadingContainer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
  },
  technicianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  technicianRowSelected: {},
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  avatarSelected: {
    backgroundColor: COLORS.primary,
  },
  avatarText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  avatarTextSelected: {
    color: COLORS.white,
  },
  technicianInfo: {
    flex: 1,
  },
  technicianName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
  },
  technicianMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  specialty: {
    fontSize: FONT_SIZE.sm,
  },
  taskCount: {
    fontSize: FONT_SIZE.sm,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: SPACING.sm,
  },
  emptyContainer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.md,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
  },
  retryText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
});

export default TechnicianPicker;
