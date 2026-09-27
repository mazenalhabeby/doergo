import React, { useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COMPANY_FIELD_KEYS, COMPANY_ONLY_FIELDS, isCompany, type CompanyOnlyField } from '@hbcfield/shared/client';
import { useTheme } from '../../../contexts/theme-context';
import { canEditClientLocale, clientLocaleName } from '../../../lib/client-locale';
import { AText, Well } from '../../amazen';
import { SectionLabel } from '../../job/job-ui';
import { ContactRow } from '../contact-row';
import { AddressRow } from '../address-row';
import { isWaiting, type ClientRecordModel } from './use-client-record';
import type { MobileCustomerContact } from '../../../lib/api/customers';

/**
 * ABOUT — who to ask for, and everything written down about them.
 *
 * ⚠️ The client's own address, phone and email lead Details. The old page drew
 * them only as two buttons, so an address was on the record and nowhere on the
 * screen; and the custom details (`Customer.details`) and the workspace were
 * stored and never shown at all. Empty fields are left out — a list of dashes
 * tells nobody anything.
 */
export function RecordAbout({
  model, spaceName, onMore, onLanguage,
}: {
  model: ClientRecordModel;
  /** The workspace's name, once known; null when filed in none. */
  spaceName: string | null;
  onMore: (link: MobileCustomerContact) => void;
  onLanguage: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const record = model.record!;
  const company = isCompany(record);

  const rowLabels = useMemo(() => ({
    primary: t('customers.record.primary'),
    more: t('customers.record.more', 'More'),
    call: t('customers.record.call'),
    email: t('customers.record.email'),
  }), [t]);
  const addressLabels = useMemo(() => ({
    primary: t('customers.record.primary'),
    navigate: t('customers.record.navigate'),
    call: t('customers.record.call'),
  }), [t]);
  const waitingLabel = t('offline.chip.waiting');

  const contacts = model.shownContacts;
  const companies = model.shownCompanies;
  /* A card earns its place by holding something or offering something. */
  const showContacts = contacts.length > 0 || (company && model.canEditInfo);
  const showWorksAt = companies.length > 0 || record.isContact === true;

  const phone = record.phone?.trim();
  const email = record.email?.trim();
  const address = record.address?.trim();
  const website = record.website?.trim();
  const facts: { key: string; label: string; value: string; action?: { label: string; onPress: () => void } }[] = [];
  if (address) facts.push({ key: 'address', label: t('customers.record.fAddress', 'Address'), value: address, action: { label: t('customers.record.directions', 'Directions'), onPress: () => void Linking.openURL(`geo:0,0?q=${encodeURIComponent(address)}`) } });
  if (phone) facts.push({ key: 'phone', label: t('customers.fPhone'), value: phone, action: { label: t('customers.record.call'), onPress: () => void Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`) } });
  if (email) facts.push({ key: 'email', label: t('customers.fEmail'), value: email, action: { label: t('customers.record.write', 'Write'), onPress: () => void Linking.openURL(`mailto:${email}`) } });
  if (company) {
    for (const field of COMPANY_ONLY_FIELDS) {
      const v = (record[field as CompanyOnlyField] as string | null | undefined)?.trim();
      if (!v) continue;
      facts.push({
        key: field,
        label: t(COMPANY_FIELD_KEYS[field], { defaultValue: t(`customers.form.${field}`) }),
        value: v,
        action: field === 'website' && website
          ? { label: t('customers.record.open', 'Open'), onPress: () => void Linking.openURL(/^https?:\/\//i.test(website) ? website : `https://${website}`) }
          : undefined,
      });
    }
  }
  if (record.contactName?.trim()) facts.push({ key: 'contactName', label: t('customers.fContact'), value: record.contactName.trim() });
  for (const [i, d] of (record.details ?? []).entries()) {
    if (d?.label?.trim() && d?.value?.trim()) facts.push({ key: `d${i}`, label: d.label.trim(), value: d.value.trim() });
  }
  if (record.notes?.trim()) facts.push({ key: 'notes', label: t('customers.form.notes'), value: record.notes.trim() });

  const editLocale = canEditClientLocale(record);

  return (
    <View style={{ gap: amazen.space(3) }}>
      {showContacts ? (
        <>
          <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{`${t('customers.record.contacts')}${contacts.length ? ` · ${contacts.length}` : ''}`}</SectionLabel>
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {contacts.length === 0 ? <AText variant="body" tone="muted" style={{ paddingVertical: amazen.space(3), fontSize: 13.5 }}>{t('customers.record.noContacts')}</AText> : null}
            {contacts.map((link, i) => (
              <ContactRow
                key={link.id}
                first={i === 0}
                link={link}
                side="person"
                onOpen={model.openRecord}
                onMore={model.canEditInfo ? onMore : undefined}
                labels={rowLabels}
                waiting={isWaiting(link) ? waitingLabel : undefined}
                busy={model.busyLink === link.id}
              />
            ))}
            {model.canEditInfo ? <AddRow label={t('customers.record.addContact')} onPress={() => model.setAdding('person')} /> : null}
          </Well>
        </>
      ) : null}

      {showWorksAt ? (
        <>
          <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{`${t('customers.record.worksAt')}${companies.length ? ` · ${companies.length}` : ''}`}</SectionLabel>
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {companies.length === 0 ? <AText variant="body" tone="muted" style={{ paddingVertical: amazen.space(3), fontSize: 13.5 }}>{t('customers.record.noCompanies')}</AText> : null}
            {companies.map((link, i) => (
              <ContactRow
                key={link.id}
                first={i === 0}
                link={link}
                side="company"
                onOpen={model.openRecord}
                onMore={model.canEditInfo ? onMore : undefined}
                labels={rowLabels}
                waiting={isWaiting(link) ? waitingLabel : undefined}
                busy={model.busyLink === link.id}
              />
            ))}
            {model.canEditInfo ? <AddRow label={t('customers.record.addCompany')} onPress={() => model.setAdding('company')} /> : null}
          </Well>
        </>
      ) : null}

      <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{t(company ? 'customers.record.details' : 'customers.record.detailsPerson')}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {facts.map((f, i) => (
          <Fact key={f.key} first={i === 0} label={f.label} value={f.value} action={f.action} />
        ))}
        <Fact
          first={facts.length === 0}
          label={t('customers.fWorkspace')}
          value={spaceName ?? t('customers.noSpace')}
          muted={!spaceName}
        />
        {/* Language for emails — always shown: "same as the organization" still decides something. */}
        <Pressable onPress={onLanguage} disabled={!editLocale} accessibilityRole={editLocale ? 'button' : 'text'}>
          <Fact
            label={t('customers.record.emailsIn', 'Emails in')}
            value={clientLocaleName(record.locale) ?? t('customers.localeSame')}
            chevron={editLocale}
          />
        </Pressable>
      </Well>

      {model.addresses.length > 0 ? (
        <>
          <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{`${t('customers.record.addresses')} · ${model.addresses.length}`}</SectionLabel>
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {model.addresses.map((a, i) => <AddressRow key={a.id} first={i === 0} address={a} labels={addressLabels} />)}
          </Well>
        </>
      ) : null}
      <View style={{ height: amazen.space(6) }} />
    </View>
  );
}

function Fact({ label, value, action, first, muted, chevron }: {
  label: string; value: string; action?: { label: string; onPress: () => void }; first?: boolean; muted?: boolean; chevron?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3), borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell }}>
      <AText numberOfLines={2} style={{ width: 86, color: c.inkMuted, fontFamily: amazen.font.mono, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' }}>{label}</AText>
      <AText variant="body" selectable style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, color: muted ? c.inkMuted : c.inkStrong }}>{value}</AText>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <AText variant="caption" style={{ color: c.accent, fontSize: 13 }}>{action.label}</AText>
        </Pressable>
      ) : chevron ? <AText variant="body" tone="muted">›</AText> : null}
    </View>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: amazen.space(3), borderTopWidth: 1, borderTopColor: c.lineWell, opacity: pressed ? 0.7 : 1 })}>
      <AText variant="body" style={{ color: c.accent, fontSize: 13.5 }}>{`＋ ${label}`}</AText>
    </Pressable>
  );
}
