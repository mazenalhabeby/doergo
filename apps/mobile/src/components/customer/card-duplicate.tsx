import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { PressableScale } from '../pressable-scale';
import { PrimaryButton } from './client-fields';
import { ClientAvatar } from './client-avatar';
import { customersApi, type MobileCustomer } from '../../lib/api';
import { useTheme } from '../../contexts/theme-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';
import { duplicateSearchTerm, looksLikeSameClient } from './card-review';

/**
 * IS THIS ALREADY IN THE BOOK?
 *
 * A card is handed over at a trade fair, and the firm that handed it over is
 * often one somebody in the office added last month. A second record for one
 * client splits its history, its reminders and its jobs in half, and the two
 * halves never meet again — the same damage `ClientPicker` exists to prevent
 * when a contact is named by hand.
 *
 * ⚠️ ONE search, and only when Save is pressed. On the way in it would fire
 * before the member has corrected the reader's guess at the name, which is the
 * field it searches; on every keystroke it would be a request per letter for a
 * question asked once. Pressed twice, the second press goes through: the member
 * has seen the answer and decided.
 *
 * ⚠️ A failed search does NOT block the save. Offline is the normal state this
 * app is built for, and a warning that cannot be produced must not become a
 * refusal — the save still queues and the duplicate, if there is one, is the
 * office's to merge.
 */
export function useDuplicateCheck() {
  const [matches, setMatches] = useState<MobileCustomer[]>([]);
  const asked = useRef(false);

  /** True when the member should be shown what was found before anything is saved. */
  const check = useCallback(async (name: string): Promise<boolean> => {
    const wanted = name.trim();
    if (asked.current || wanted.length < 4) return false;
    asked.current = true;
    try {
      const rows = await customersApi.list({
        search: duplicateSearchTerm(wanted),
        limit: 5,
        // Contacts too: somebody already recorded as the contact at a firm is
        // exactly the person whose card is now being scanned as a client.
        contacts: 'all',
        portalResident: false,
      });
      const close = rows.filter((r) => looksLikeSameClient(r.name, wanted));
      setMatches(close);
      return close.length > 0;
    } catch {
      return false;
    }
  }, []);

  const dismiss = useCallback(() => setMatches([]), []);

  return { matches, check, dismiss };
}

/**
 * What was found, and the two things worth doing about it.
 *
 * "Open it" is listed FIRST because it is almost always the right answer: the
 * client exists, and what the member wanted was to reach them. "Save anyway" is
 * there because two firms really can share a name, and a warning that cannot be
 * overruled becomes a wall.
 */
export function DuplicateSheet({
  matches,
  saving,
  onOpen,
  onSaveAnyway,
  onClose,
}: {
  matches: MobileCustomer[];
  saving: boolean;
  onOpen: (client: MobileCustomer) => void;
  onSaveAnyway: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <BlurSheet visible={matches.length > 0} onClose={saving ? () => {} : onClose}>
      <SheetPanel title={t('scan.maybeExists')} onClose={onClose} closeDisabled={saving}>
        <Text style={s.body}>{t('scan.maybeExistsBody')}</Text>
        <View style={s.rows}>
          {matches.map((m, i) => (
            <PressableScale
              key={m.id}
              onPress={() => onOpen(m)}
              accessibilityRole="button"
              accessibilityLabel={m.name}
              style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            >
              <ClientAvatar customer={m} size={30} />
              <View style={s.rowText}>
                <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                {!!(m.email || m.phone) && (
                  <Text style={s.rowSub} numberOfLines={1}>{m.email || m.phone}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </PressableScale>
          ))}
        </View>
        <PrimaryButton label={t('scan.saveAnyway')} onPress={onSaveAnyway} busy={saving} />
        <View style={{ height: SPACING.lg }} />
      </SheetPanel>
    </BlurSheet>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { fontSize: FONT_SIZE.base, color: c.textMuted, lineHeight: 20, marginTop: SPACING.sm },
    rows: {
      marginTop: SPACING.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium, color: c.textPrimary },
    rowSub: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: 1 },
  });
