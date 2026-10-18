import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COMPANY_FIELD_KEYS, COMPANY_ONLY_FIELDS, isCompany, type CompanyOnlyField } from '@hbcfield/shared/client';
import { useTheme } from '../../../contexts/theme-context';
import { canEditClientLocale, clientLocaleName } from '../../../lib/client-locale';
import { AText, Well, SectionLabel } from '../../amazen';
import { FactRow } from '../../amazen/fact-row';
import { ContactRow } from '../contact-row';
import { AddressRow } from '../address-row';
import { isWaiting, type ClientRecordModel } from './use-client-record';
import type { MobileCustomerContact } from '../../../lib/api/customers';
import { geoUrl, mailtoUrl, openSafeUrl, telUrl, webUrl } from '../../../lib/safe-links';

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
  if (address)
    facts.push({
      key: 'address',
      label: t('customers.record.fAddress', 'Address'),
      value: address,
      action: geoUrl(address)
        ? { label: t('customers.record.directions', 'Directions'), onPress: () => void openSafeUrl(geoUrl(address)) }
        : undefined,
    });
  if (phone)
    facts.push({
      key: 'phone',
      label: t('customers.fPhone'),
      value: phone,
      action: telUrl(phone)
        ? { label: t('customers.record.call'), onPress: () => void openSafeUrl(telUrl(phone)) }
        : undefined,
    });
  if (email)
    facts.push({
      key: 'email',
      label: t('customers.fEmail'),
      value: email,
      action: mailtoUrl(email)
        ? { label: t('customers.record.write', 'Write'), onPress: () => void openSafeUrl(mailtoUrl(email)) }
        : undefined,
    });
  if (company) {
    for (const field of COMPANY_ONLY_FIELDS) {
      const v = (record[field as CompanyOnlyField] as string | null | undefined)?.trim();
      if (!v) continue;
      facts.push({
        key: field,
        label: t(COMPANY_FIELD_KEYS[field], { defaultValue: t(`customers.form.${field}`) }),
        value: v,
        action: field === 'website' && website
          ? { label: t('customers.record.open', 'Open'), onPress: () => void openSafeUrl(webUrl(website)) }
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
        <LinkSection
          title={t('customers.record.contacts')}
          links={contacts}
          side="person"
          empty={t('customers.record.noContacts')}
          addLabel={t('customers.record.addContact')}
          model={model}
          onMore={onMore}
          labels={rowLabels}
          waitingLabel={waitingLabel}
        />
      ) : null}

      {showWorksAt ? (
        <LinkSection
          title={t('customers.record.worksAt')}
          links={companies}
          side="company"
          empty={t('customers.record.noCompanies')}
          addLabel={t('customers.record.addCompany')}
          model={model}
          onMore={onMore}
          labels={rowLabels}
          waitingLabel={waitingLabel}
        />
      ) : null}

      <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>
        {t(company ? 'customers.record.details' : 'customers.record.detailsPerson')}
      </SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {facts.map((f, i) => (
          <FactRow key={f.key} first={i === 0} label={f.label} value={f.value} action={f.action} selectable />
        ))}
        <FactRow
          first={facts.length === 0}
          label={t('customers.fWorkspace')}
          value={spaceName ?? t('customers.noSpace')}
          muted={!spaceName}
        />
        {/* Language for emails — always shown: "same as the organization" still decides something. */}
        <FactRow
          label={t('customers.record.emailsIn', 'Emails in')}
          value={clientLocaleName(record.locale) ?? t('customers.localeSame')}
          onPress={editLocale ? onLanguage : undefined}
        />
      </Well>

      {model.addresses.length > 0 ? (
        <>
          <SectionLabel
            style={{ paddingHorizontal: amazen.space(1) }}
          >{`${t('customers.record.addresses')} · ${model.addresses.length}`}</SectionLabel>
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {model.addresses.map((a, i) => <AddressRow key={a.id} first={i === 0} address={a} labels={addressLabels} />)}
          </Well>
        </>
      ) : null}
      <View style={{ height: amazen.space(6) }} />
    </View>
  );
}

/**
 * One side of the contact links — the people at a company, or the companies a
 * person works at: a counted title, the rows, and Add for who may edit.
 */
function LinkSection({
  title, links, side, empty, addLabel, model, onMore, labels, waitingLabel,
}: {
  title: string;
  links: MobileCustomerContact[];
  side: 'person' | 'company';
  empty: string;
  addLabel: string;
  model: ClientRecordModel;
  onMore: (link: MobileCustomerContact) => void;
  labels: React.ComponentProps<typeof ContactRow>['labels'];
  waitingLabel: string;
}) {
  const { amazen } = useTheme();
  return (
    <>
      <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{`${title}${links.length ? ` · ${links.length}` : ''}`}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {links.length === 0 ? (
          <AText variant="body" tone="muted" style={{ paddingVertical: amazen.space(3), fontSize: 13.5 }}>
            {empty}
          </AText>
        ) : null}
        {links.map((link, i) => (
          <ContactRow
            key={link.id}
            first={i === 0}
            link={link}
            side={side}
            onOpen={model.openRecord}
            onMore={model.canEditInfo ? onMore : undefined}
            labels={labels}
            waiting={isWaiting(link) ? waitingLabel : undefined}
            busy={model.busyLink === link.id}
          />
        ))}
        {model.canEditInfo ? <AddRow label={addLabel} onPress={() => model.setAdding(side)} /> : null}
      </Well>
    </>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingVertical: amazen.space(3),
        borderTopWidth: 1,
        borderTopColor: c.lineWell,
        opacity: pressed ? 0.7 : 1,
      })}>
      <AText variant="body" style={{ color: c.accent, fontSize: 13.5 }}>{`＋ ${label}`}</AText>
    </Pressable>
  );
}
