import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

// =============================================================================
// LoadingState -- full-screen centered spinner
// =============================================================================

export function LoadingState({ message }: { message?: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        {message ? (
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// =============================================================================
// ErrorState -- full-screen error with retry
// =============================================================================

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={[styles.errorText, { color: colors.textMuted }]}>
          {message}
        </Text>
        {onRetry ? (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>{t('components.screenStates.retry')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  loadingText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZE.xl,
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
