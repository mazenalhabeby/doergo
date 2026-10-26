import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { type SupportTicket } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { CountBadge } from '@/components/amazen/count-badge';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';

/** SupportScreen's module-level helpers, moved here unchanged so its sections can read them too. */
/* ---------------- rows: memoised ---------------- */

export const TicketRow = memo(function TicketRow({
  ticket: tk,
  onOpen,
}: {
  ticket: SupportTicket;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pendingSync = !!(tk as { pendingSync?: boolean }).pendingSync;
  return (
    <TouchableOpacity
      // A request still on the phone has no thread on the server to open yet.
      disabled={pendingSync}
      onPress={() => onOpen(tk.id)}
      style={[styles.ticketRow, { borderColor: colors.border }]}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: ['OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER'].includes(tk.status)
              ? COLORS.primary
              : colors.border,
          },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.ticketSubject, { color: colors.textPrimary }]} numberOfLines={1}>
          {tk.subject}
        </Text>
        <Text style={[styles.ticketMeta, { color: colors.textSecondary }]}>
          {pendingSync ? t('offline.chip.waiting') : t(`support.status.${tk.status}`, tk.status)}
        </Text>
      </View>
      {!!tk.unreadForCustomer && <CountBadge count={tk.unreadForCustomer} />}
    </TouchableOpacity>
  );
});

export const SupportBubble = memo(function SupportBubble({
  body,
  mine,
  pending,
}: {
  body: string;
  mine: boolean;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: COLORS.primary }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
          pending && { opacity: 0.7 },
        ]}
      >
        <Text style={{ color: mine ? '#fff' : colors.textPrimary, fontSize: FONT_SIZE.sm }}>{body}</Text>
        {pending && (
          <Icon
            name="time"
            size={11}
            color="#fff"
            style={{ alignSelf: 'flex-end', marginTop: 2 }}
            accessibilityLabel={t('offline.chip.waiting')}
          />
        )}
      </View>
    </View>
  );
});

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  slaRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  errorText: { color: '#B91C1C', fontSize: FONT_SIZE.sm },
  empty: { textAlign: 'center', marginTop: 40, fontSize: FONT_SIZE.sm },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ticketSubject: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  ticketMeta: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    margin: SPACING.md,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.md,
  },
  textarea: { minHeight: 140, textAlignVertical: 'top' },
  bubbleRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.sm, borderTopWidth: 1 },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: FONT_SIZE.sm,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
