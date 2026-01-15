import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/auth-context';

const PRIMARY_COLOR = '#2563EB';

export default function TasksScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      {/* Welcome Header */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeGreeting}>
            Hello, {user?.firstName || 'Worker'}!
          </Text>
          <Text style={styles.welcomeSubtitle}>Ready for today's tasks?</Text>
        </View>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={24} color={PRIMARY_COLOR} />
        </View>
      </View>

      {/* Empty State */}
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyTitle}>No tasks yet</Text>
        <Text style={styles.emptySubtitle}>
          Tasks assigned to you will appear here
        </Text>
      </View>

      {/* Refresh Button */}
      <TouchableOpacity style={styles.refreshButton} activeOpacity={0.8}>
        <Ionicons name="refresh" size={20} color="white" />
        <Text style={styles.refreshButtonText}>Refresh Tasks</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  welcomeCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  welcomeContent: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
