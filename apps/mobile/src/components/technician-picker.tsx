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
  const [technicians, setTechnicians] = useState<TechnicianListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchTechnicians = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await techniciansApi.list({ status: 'active', limit: 50 });
      setTechnicians(result.data || []);
    } catch (err) {
      console.error('Failed to load technicians:', err);
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
        style={[styles.technicianRow, isSelected && styles.technicianRowSelected]}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
          <Text style={[styles.avatarText, isSelected && styles.avatarTextSelected]}>
            {item.firstName[0]}{item.lastName[0]}
          </Text>
        </View>
        <View style={styles.technicianInfo}>
          <Text style={styles.technicianName}>
            {item.firstName} {item.lastName}
          </Text>
          <View style={styles.technicianMeta}>
            {item.specialty && (
              <Text style={styles.specialty}>{item.specialty}</Text>
            )}
            <Text style={styles.taskCount}>
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
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Technician</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.slate500} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={COLORS.slate400} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name..."
              placeholderTextColor={COLORS.slate400}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.slate400} />
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
                  <Ionicons name="people-outline" size={40} color={COLORS.slate300} />
                  <Text style={styles.emptyText}>
                    {search ? 'No technicians match your search' : 'No technicians available'}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '75%',
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
    color: COLORS.slate800,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.slate50,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
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
  technicianRowSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.slate100,
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
    color: COLORS.slate500,
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
    color: COLORS.slate800,
  },
  technicianMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  specialty: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
  },
  taskCount: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
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
    color: COLORS.slate400,
    marginTop: SPACING.md,
  },
});

export default TechnicianPicker;
