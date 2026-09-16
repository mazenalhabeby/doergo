import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { LabelledField, ChoiceChip, PrimaryButton } from './client-fields';
import { COLORS, SPACING, FONT_SIZE } from '../../lib/constants';
import { customersApi } from '../../lib/api';
import type { MobileCustomerContact } from '../../lib/api/customers';

/**
 * Attaching a person to a company.
 *
 * ⚠️ The endpoint takes EITHER `personId` (somebody already in the book) or
 * `person` (a new record made on the spot), and this sheet only offers the
 * second. Choosing an existing person needs a searchable picker over the whole
 * client book, which is the LIST screen's job and is being rebuilt in parallel;
 * shipping half a picker here would mean two ways to search clients on one
 * phone. Adding a new person is the case that actually happens at a customer's
 * desk, and it is the one that was impossible before.
 *
 * ⚠️ The person created is a CONTACT (`isContact` on the server), not a client.
 * That flag is what keeps a firm with six contacts from reading as six clients
 * on a bill that charges per client — so this must never reach `POST /customers`
 * as a shortcut, however similar the fields look.
 */
export function AddContactSheet({
  visible,
  companyId,
  onClose,
  onAdded,
}: {
  visible: boolean;
  companyId: string;
  onClose: () => void;
  onAdded: (link: MobileCustomerContact) => void;
}) {
  const { t } = useTranslation();
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
    setName(''); setRole(''); setEmail(''); setPhone(''); setIsPrimary(false); setError(null);
  }, [visible]);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const link = await customersApi.addContact(companyId, {
        person: { name: trimmed, email: email.trim() || undefined, phone: phone.trim() || undefined },
        role: role.trim() || undefined,
        isPrimary: isPrimary || undefined,
      });
      onAdded(link);
      onClose();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || t('customers.record.addContactFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BlurSheet visible={visible} onClose={saving ? () => {} : onClose}>
      <SheetPanel title={t('customers.record.addContact')} onClose={onClose} closeDisabled={saving}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <LabelledField label={t('customers.fName')} value={name} onChangeText={setName} autoCapitalize="words" />
          <LabelledField
            label={t('customers.record.contactRole')}
            value={role}
            onChangeText={setRole}
            placeholder={t('customers.record.contactRoleHint')}
          />
          <LabelledField label={t('customers.fEmail')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <LabelledField label={t('customers.fPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          <View style={s.primaryRow}>
            <ChoiceChip
              label={t('customers.record.makePrimary')}
              selected={isPrimary}
              onPress={() => setIsPrimary((v) => !v)}
            />
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          <PrimaryButton
            label={t('customers.record.addContactSave')}
            onPress={add}
            disabled={!name.trim()}
            busy={saving}
          />
          <View style={{ height: SPACING.lg }} />
        </ScrollView>
      </SheetPanel>
    </BlurSheet>
  );
}

// Neither of these takes a colour from the theme — the error red is one of the
// fixed status hues that reads on both — so the sheet keeps a plain stylesheet
// rather than a theme-parameterised one it would never vary.
const s = StyleSheet.create({
  primaryRow: { flexDirection: 'row', marginTop: SPACING.lg },
  error: { fontSize: FONT_SIZE.base, color: COLORS.error, marginTop: SPACING.md },
});
