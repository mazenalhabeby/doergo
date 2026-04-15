import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { adminInvitationsApi, type Invitation } from '../../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../../src/lib/constants';
import { Skeleton } from '../../../src/components';

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  PENDING: { color: COLORS.amber, bg: COLORS.amber + '20' },
  ACCEPTED: { color: COLORS.success, bg: COLORS.success + '20' },
  EXPIRED: { color: COLORS.slate500, bg: COLORS.slate200 },
  REVOKED: { color: COLORS.error, bg: COLORS.error + '20' },
};

export default function InvitationsScreen() {
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newRole, setNewRole] = useState<'TECHNICIAN' | 'DISPATCHER'>('TECHNICIAN');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const fetchInvitations = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      const result = await adminInvitationsApi.list();
      setInvitations(result);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error('Error', err?.message || 'Failed to load invitations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchInvitations(); }, [fetchInvitations]));

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await adminInvitationsApi.create({
        targetRole: newRole,
        specialty: newSpecialty.trim() || undefined,
        expiresInHours: 72,
      });
      setGeneratedCode(result.code);
      await fetchInvitations();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to create invitation');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      const { Share } = require('react-native');
      await Share.share({ message: `Join with invitation code: ${code}` });
    } catch {
      Alert.alert('Code', code);
    }
  };

  const handleRevoke = (inv: Invitation) => {
    Alert.alert('Revoke Invitation', 'This invitation will no longer be usable.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminInvitationsApi.revoke(inv.id);
            await fetchInvitations();
          } catch (err: any) {
            toast.error('Error', err?.message || 'Failed to revoke');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Invitation }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.PENDING;
    const isPending = item.status === 'PENDING';

    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={s.cardInfo}>
            <View style={s.roleRow}>
              <Text style={[s.role, { color: colors.textPrimary }]}>
                {item.targetRole === 'TECHNICIAN' ? 'Technician' : 'Dispatcher'}
              </Text>
              {item.specialty && <Text style={[s.specialty, { color: colors.textMuted }]}> · {item.specialty}</Text>}
            </View>
            <Text style={[s.date, { color: colors.textMuted }]}>
              Created {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' · '}Expires {new Date(item.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            {item.acceptedBy && (
              <Text style={[s.acceptedBy, { color: colors.textSecondary }]}>
                Accepted by {item.acceptedBy.firstName} {item.acceptedBy.lastName}
              </Text>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[s.statusText, { color: sc.color }]}>{item.status}</Text>
          </View>
        </View>
        {isPending && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.revokeBtn, { borderColor: COLORS.error }]}
              onPress={() => handleRevoke(item)}
            >
              <Text style={[s.revokeBtnText, { color: COLORS.error }]}>Revoke</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[s.container, { backgroundColor: colors.surface }]}>
        <Skeleton.ListScreen />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      {/* Create Button */}
      <TouchableOpacity
        style={s.createBtn}
        onPress={() => { setShowCreate(true); setGeneratedCode(null); setNewSpecialty(''); }}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle" size={20} color={COLORS.white} />
        <Text style={s.createBtnText}>Create Invitation</Text>
      </TouchableOpacity>

      <FlatList
        data={invitations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchInvitations(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="mail-outline" size={40} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No invitations yet</Text>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowCreate(false)}>
          <View style={[s.modal, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]} onStartShouldSetResponder={() => true}>
            {generatedCode ? (
              <>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} style={{ alignSelf: 'center' }} />
                <Text style={[s.modalTitle, { color: colors.textPrimary, textAlign: 'center', marginTop: SPACING.md }]}>Invitation Created</Text>
                <TouchableOpacity style={s.codeBox} onPress={() => handleCopy(generatedCode)} activeOpacity={0.7}>
                  <Text style={s.codeText}>{generatedCode}</Text>
                  <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={[s.codeHint, { color: colors.textMuted }]}>Tap to copy · Expires in 3 days</Text>
                <TouchableOpacity style={s.doneBtn} onPress={() => setShowCreate(false)}>
                  <Text style={s.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[s.modalTitle, { color: colors.textPrimary }]}>New Invitation</Text>

                <Text style={[s.label, { color: colors.textSecondary }]}>Role</Text>
                <View style={s.roleToggle}>
                  {(['TECHNICIAN', 'DISPATCHER'] as const).map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[s.roleOption, newRole === r && { backgroundColor: COLORS.primary }]}
                      onPress={() => setNewRole(r)}
                    >
                      <Text style={[s.roleOptionText, { color: newRole === r ? COLORS.white : colors.textSecondary }]}>
                        {r === 'TECHNICIAN' ? 'Technician' : 'Dispatcher'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {newRole === 'TECHNICIAN' && (
                  <>
                    <Text style={[s.label, { color: colors.textSecondary, marginTop: SPACING.md }]}>Job Title (optional)</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                      placeholder="e.g. Electrician"
                      placeholderTextColor={colors.textMuted}
                      value={newSpecialty}
                      onChangeText={setNewSpecialty}
                    />
                  </>
                )}

                <TouchableOpacity style={s.submitBtn} onPress={handleCreate} disabled={isCreating} activeOpacity={0.8}>
                  {isCreating ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                    <Text style={s.submitBtnText}>Generate Code</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, marginHorizontal: SPACING.lg, marginVertical: SPACING.md, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  createBtnText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, marginRight: SPACING.md },
  roleRow: { flexDirection: 'row', alignItems: 'center' },
  role: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  specialty: { fontSize: FONT_SIZE.base },
  date: { fontSize: FONT_SIZE.sm, marginTop: 4 },
  acceptedBy: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  statusBadge: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm },
  statusText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  actions: { marginTop: SPACING.md },
  revokeBtn: { borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  revokeBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.md },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: SPACING.xxl },
  modal: { borderRadius: RADIUS.xl, padding: SPACING.xxl, ...SHADOWS.lg },
  modalTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm },
  roleToggle: { flexDirection: 'row', gap: SPACING.sm },
  roleOption: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary },
  roleOptionText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  input: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: FONT_SIZE.base },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.xl },
  submitBtnText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: '#f0fdf4', paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xxl, borderRadius: RADIUS.md, marginTop: SPACING.lg },
  codeText: { fontSize: 24, fontWeight: '800', color: COLORS.primary, letterSpacing: 2 },
  codeHint: { textAlign: 'center', fontSize: FONT_SIZE.sm, marginTop: SPACING.sm },
  doneBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.xl },
  doneBtnText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
});
