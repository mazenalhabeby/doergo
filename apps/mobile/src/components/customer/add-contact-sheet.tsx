import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { PressableScale } from '../pressable-scale';
import { LabelledField, ChoiceChip, PrimaryButton } from './client-fields';
import { ClientPicker } from './client-picker';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';
import { customersApi } from '../../lib/api';
import type { MobileCustomer } from '../../lib/api';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { addContactFromPhone } from '../../offline/crm/client-actions';

/**
 * Which END of the link this sheet is choosing.
 *
 * ⚠️ The SIDE decides the direction, not the record's `type` — and that is
 * deliberate. A real book records firms as PERSON all the time ("BILLA AG",
 * "Siemens AG"), so a direction read off the type would point the wrong way on
 * exactly the records this feature is for. The card the sheet was opened from
 * knows what it means: "Contact people" is asking who works HERE, "Works at" is
 * asking where this person works. Same link, same endpoint, same server checks
 * — only which end is being chosen changes. The web dialog splits it the same
 * way (its `mine` prop).
 */
export type ContactSide = 'person' | 'company';

/**
 * Attaching a person to a company — the person already in the book, or a new one.
 *
 * ⚠️ SEARCH COMES FIRST and the create form is behind it. This sheet used to
 * offer only "create", and that is not a missing convenience: the person being
 * named is usually already a client, with their own history, reminders and
 * jobs, so the only route available produced a SECOND record for one human
 * being — and the two halves of what is known about them never meet again.
 * Opening on a blank form would produce a second Anna every time somebody was
 * in a hurry.
 *
 * ⚠️ The person created here is a CONTACT (`isContact` on the server), not a
 * client. That flag is what keeps a firm with six contacts from reading as six
 * clients on a bill that charges per client — so this must never reach
 * `POST /customers` as a shortcut, however similar the fields look.
 *
 * ⚠️ Creating is not offered from the company side. Inventing a firm while
 * filling in one person's details is how a duplicate company appears under a
 * slightly different spelling; the web dialog hides the same toggle for the
 * same reason.
 */
export function AddContactSheet({
  visible,
  /** The client whose record this sheet was opened from. */
  recordId,
  side,
  onClose,
  onAdded,
}: {
  visible: boolean;
  recordId: string;
  side: ContactSide;
  onClose: () => void;
  /**
   * It went, or it is waiting.
   *
   * ⚠️ Not the link the server wrote. It only ever carried the PERSON end —
   * `addContact` selects `person` and never `company`, whichever way round the
   * call was made — so the "Works at" side always had to re-read anyway; and
   * with the attachment possibly travelling through the outbox there may be no
   * server answer at all. The caller re-reads the panel it changed, or, when it
   * is queued, leaves the row the overlay is already drawing.
   */
  onAdded: (queued: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const write = useQueuedWrite();
  const [mode, setMode] = useState<'find' | 'create'>('find');
  const [picked, setPicked] = useState<MobileCustomer | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh sheet every time it opens — otherwise the second contact starts
  // pre-filled with the first one's details, which is easy to save unnoticed.
  useEffect(() => {
    if (!visible) return;
    setMode('find'); setPicked(null);
    setName(''); setRole(''); setEmail(''); setPhone(''); setIsPrimary(false); setError(null);
  }, [visible]);

  // Choosing somebody is the answer to the whole sheet; a name typed into the
  // create form before switching back is not also an answer.
  const finding = side === 'company' || mode === 'find';
  const ready = finding ? !!picked : !!name.trim();

  const add = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      /*
        From the person's side the chosen record is the COMPANY and this record
        is the person — the two ends swap, nothing else does. ONE body either
        way, so the queued attachment and the direct call cannot disagree about
        which end is which.
      */
      const companyId = side === 'company' ? picked!.id : recordId;
      const input = {
        ...(side === 'company'
          ? { personId: recordId }
          : mode === 'find'
            ? { personId: picked!.id }
            : { person: { name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined } }),
        ...(role.trim() ? { role: role.trim() } : {}),
        ...(isPrimary ? { isPrimary: true } : {}),
      };
      /*
        ⚠️ The NAME the waiting row shows, and it never reaches the server
        (`$`-prefixed keys are stripped in http-transport). When an existing
        person is chosen the body carries their id and nothing else, and a row
        reading "Waiting to send" with no name on it is worse than no row.
      */
      const shownName = side === 'company' ? picked!.name : mode === 'find' ? picked!.name : name.trim();
      const outcome = await write.run(
        (e) => addContactFromPhone(e, { companyId, ...input, shownName, shownId: picked?.id }),
        () => customersApi.addContact(companyId, input),
      );
      if (outcome.kind === 'refused') {
        setError(outcome.message || t('customers.record.addContactFailed'));
        return;
      }
      onAdded(outcome.kind === 'queued');
      onClose();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || t('customers.record.addContactFailed'));
    } finally {
      setSaving(false);
    }
  };

  const title = side === 'company'
    ? t('customers.record.addCompany')
    : mode === 'find'
      ? t('customers.record.addContact')
      : t('customers.record.newContact');

  return (
    <BlurSheet visible={visible} onClose={saving ? () => {} : onClose}>
      <SheetPanel title={title} onClose={onClose} closeDisabled={saving}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {finding ? (
            <ClientPicker
              kind={side === 'company' ? 'COMPANY' : 'PERSON'}
              excludeId={recordId}
              selectedId={picked?.id ?? null}
              onSelect={setPicked}
            />
          ) : (
            <>
              <LabelledField label={t('customers.fName')} value={name} onChangeText={setName} autoCapitalize="words" />
              <LabelledField label={t('customers.fEmail')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <LabelledField label={t('customers.fPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              {/* The sentence that makes this safe to use freely — it says what
                  creating somebody here does NOT do to the bill. */}
              <Text style={[s.notice, { color: colors.textMuted }]}>{t('customers.record.contactNotAClient')}</Text>
            </>
          )}

          <LabelledField
            label={t('customers.record.contactRole')}
            value={role}
            onChangeText={setRole}
            placeholder={t('customers.record.contactRoleHint')}
          />

          <View style={s.primaryRow}>
            <ChoiceChip
              label={t('customers.record.makePrimary')}
              selected={isPrimary}
              onPress={() => setIsPrimary((v) => !v)}
            />
          </View>

          {/* The way out when the search finds nobody — and the way back.
              Offered only where a PERSON is being chosen: inventing a company
              from here is not on offer, for the reason given above. */}
          {side === 'person' && (
            <PressableScale
              onPress={() => { setMode(mode === 'find' ? 'create' : 'find'); setPicked(null); }}
              hitSlop={8}
              accessibilityRole="button"
              style={s.switch}
            >
              <Ionicons name={mode === 'find' ? 'add' : 'search'} size={15} color={COLORS.primary} />
              <Text style={s.switchText}>
                {t(mode === 'find' ? 'customers.record.createPerson' : 'customers.record.backToSearch')}
              </Text>
            </PressableScale>
          )}

          {!!error && <Text style={s.error}>{error}</Text>}

          <PrimaryButton
            label={t('customers.record.addContactSave')}
            onPress={add}
            disabled={!ready}
            busy={saving}
          />
          <View style={{ height: SPACING.lg }} />
        </ScrollView>
      </SheetPanel>
    </BlurSheet>
  );
}

// A plain stylesheet rather than a theme-parameterised one: the error red and
// the brand green are the documented fixed hues that read on both themes, and
// the one line that needs a theme colour takes it inline above — building a
// whole styles(colors) factory for a single muted grey would cost every render
// of this sheet a new StyleSheet for nothing.
const s = StyleSheet.create({
  primaryRow: { flexDirection: 'row', marginTop: SPACING.lg },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  switchText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium, color: COLORS.primary },
  notice: { fontSize: FONT_SIZE.sm, lineHeight: 18, marginTop: SPACING.md },
  error: { fontSize: FONT_SIZE.base, color: COLORS.error, marginTop: SPACING.md },
});
