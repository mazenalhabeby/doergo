import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useAuth } from '../../contexts/auth-context';
import { isExternalMember } from '../../lib/member-reach';
import { customersApi } from '../../lib/api';
import { canScanCards } from '../../lib/card-scan';
import { canReadContacts } from '../../lib/phone-contacts';
import { CLIENT_LOCALE_OPTIONS, newClientInput, type NewClientForm } from '../../lib/client-locale';
import { useQueuedCreate } from '../../offline/actions/queued-create';
import { AText, FilterPill, FilterRow, PrimaryButton, JobField, SectionLabel, SheetOption } from '../../components/amazen';
import { JobSheet } from '../job/job-ui';
import { ImportContactsGlyph, ScanCardGlyph } from '../../components/glyphs/tile-glyphs';

const EMPTY: NewClientForm = { name: '', contactName: '', email: '', phone: '', type: 'COMPANY' };

/**
 * Adding a client: scan a card, import from the phone's contacts, or type it in.
 *
 * ⚠️ ONE sheet, two steps — never two sheets. A sheet is a Modal that stays
 * mounted while it animates out; closing one and opening another in the same
 * tick leaves two, iOS will not present the second, and its invisible backdrop
 * swallows every touch.
 *
 * Scanning is an accelerator, never the only door: a bent card, a phone call,
 * or no card at all still has to work. Adding works with no signal — the
 * create is queued, with the SAME body the direct save would send.
 */
export function AddClientSheet({
  visible, onClose, spaces, startSpaceId, onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  /** Workspaces that run CRM. */
  spaces: { id: string; name: string }[];
  /** The workspace being looked at, so the client lands where the person is looking. */
  startSpaceId: string | null;
  onAdded: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const clientCreate = useQueuedCreate('customer.create');
  const { user } = useAuth();
  /*
    The card camera and the address book are the organization's own intake
    (`@DenyExternal` on import). An external member given "add clients" in
    their workspace types the client in.
  */
  const staff = !isExternalMember(user as never);
  const canScan = staff && canScanCards();
  const canImport = staff && canReadContacts();
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const [form, setForm] = useState<NewClientForm>(EMPTY);
  const [spaceId, setSpaceId] = useState<string | null>(startSpaceId);
  const [locale, setLocale] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Only a build that can do something else offers the choice; otherwise straight to the form.
    setStep(canScan || canImport ? 'choose' : 'form');
    setSpaceId(startSpaceId);
  }, [visible, startSpaceId, canScan, canImport]);

  const set = (k: keyof NewClientForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const company = form.type === 'COMPANY';

  const scan = () => {
    onClose();
    /*
      Push AFTER the sheet has left — pushing while a modal dismisses races the
      same presentation, and the camera arrives under a leaving backdrop.
      ⚠️ The workspace travels with it, or a scanned client is filed nowhere.
    */
    const target = spaceId;
    setTimeout(() => router.push({ pathname: '/(app)/scan-card', params: target ? { spaceId: target } : {} } as never), 280);
  };

  /** Several at once, from the address book — its own screen, which carries the workspace too. */
  const importContacts = () => {
    onClose();
    const target = spaceId;
    setTimeout(() => router.push({ pathname: '/(app)/import-contacts', params: target ? { spaceId: target } : {} } as never), 280);
  };

  const save = async () => {
    const input = newClientInput(form, spaceId, locale);
    if (!input) return;
    setSaving(true);
    try {
      const outcome = await clientCreate.run({ lane: 'crm:new', body: input }, () => customersApi.create(input));
      if (outcome.kind === 'refused') {
        toast.error(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('customers.addFailed', 'Could not add the client'),
        );
        return;
      }
      toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('customers.added', 'Client added'));
      setForm(EMPTY);
      setLocale('');
      onClose();
      onAdded();
    } catch (e) {
      toast.error((e as Error)?.message || t('customers.addFailed', 'Could not add the client'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <JobSheet
      visible={visible}
      onClose={onClose}
      busy={saving}
      title={step === 'choose' ? t('customers.add', 'Add client') : t('customers.newClient', 'New client')}>
      {step === 'choose' ? (
        <>
          {canScan ? (
            <SheetOption
              label={t('customers.scanCard', 'Scan a business card')}
              hint={t('customers.scanCardSub', 'Fills the form for you')}
              Glyph={ScanCardGlyph}
              onPress={scan}
            />
          ) : null}
          {canImport ? (
            <SheetOption
              label={t('contactsImport.option')}
              hint={t('contactsImport.optionSub')}
              Glyph={ImportContactsGlyph}
              onPress={importContacts}
            />
          ) : null}
          <SheetOption
            label={t('customers.enterDetails', 'Enter details')}
            hint={t('customers.enterDetailsSub', 'Type it in')}
            onPress={() => setStep('form')}
          />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', backgroundColor: c.sunken, borderRadius: amazen.radius.full, padding: 4 }}>
            {(['COMPANY', 'PERSON'] as const).map((k) => {
              const on = form.type === k;
              return (
                <Pressable key={k} onPress={() => setForm((f) => ({ ...f, type: k }))} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: amazen.space(2.25),
                    borderRadius: amazen.radius.full,
                    backgroundColor: on ? c.tile : 'transparent',
                  }}>
                  <AText variant="body" style={{ fontSize: 13.5, color: on ? c.inkStrong : c.inkMuted }}>
                    {k === 'COMPANY' ? t('customers.record.kindCompany', 'Company') : t('customers.record.kindPerson', 'Person')}
                  </AText>
                </Pressable>
              );
            })}
          </View>
          <JobField
            value={form.name}
            onChangeText={set('name')}
            placeholder={
              company ? t('customers.fCompanyName', 'Company name') : t('customers.fPersonName', 'Full name')
            }
            autoCapitalize="words"
            autoFocus
            maxLength={200}
          />
          {company ? (
            <JobField
              value={form.contactName}
              onChangeText={set('contactName')}
              placeholder={t('customers.fContactOptional', 'Contact person (optional)')}
              autoCapitalize="words"
              maxLength={200}
            />
          ) : null}
          <JobField
            value={form.phone}
            onChangeText={set('phone')}
            placeholder={t('customers.fPhone', 'Phone')}
            keyboardType="phone-pad"
            maxLength={40}
          />
          <JobField
            value={form.email}
            onChangeText={set('email')}
            placeholder={t('customers.fEmail', 'Email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
          />

          {/* A client filed in no workspace is invisible in every workspace tab, so this is not an afterthought. */}
          {spaces.length ? (
            <>
              <SectionLabel>{t('customers.fWorkspace', 'Workspace')}</SectionLabel>
              <FilterRow>
                {[{ id: null as string | null, name: t('customers.noSpace', 'No workspace') }, ...spaces].map((s) => (
                  <FilterPill key={s.id ?? 'none'} label={s.name} on={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
                ))}
              </FilterRow>
            </>
          ) : null}

          <SectionLabel>{t('customers.locale', 'Language for emails')}</SectionLabel>
          <FilterRow>
            {[{ value: '', label: t('customers.localeSame', 'Same as the organization') }, ...CLIENT_LOCALE_OPTIONS].map((o) => (
              <FilterPill key={o.value || 'same'} label={o.label} on={locale === o.value} onPress={() => setLocale(o.value)} />
            ))}
          </FilterRow>

          <PrimaryButton
            label={t('customers.save', 'Save client')}
            onPress={() => void save()}
            loading={saving}
            disabled={!form.name.trim()}
          />
        </>
      )}
    </JobSheet>
  );
}
