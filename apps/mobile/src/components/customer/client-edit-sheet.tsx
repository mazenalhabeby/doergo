import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  clientKind,
  clearCompanyFields,
  COMPANY_ONLY_FIELDS,
  COMPANY_FIELD_KEYS,
  type ClientKind,
  type CompanyOnlyField,
} from '@hbcfield/shared/client';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { LabelledField, ChoiceChip, FieldGroupTitle, PrimaryButton } from './client-fields';
import { CLIENT_LOCALE_OPTIONS, clientLocaleFormValue, clientLocalePayload } from '../../lib/client-locale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, type ThemeColors } from '../../lib/constants';
import { customersApi, locationsApi, type MobileCustomer } from '../../lib/api';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { changedFields, updateClientFromPhone } from '../../offline/crm/client-actions';

/**
 * Editing a client, on the phone, for the first time.
 *
 * Before this the phone could change exactly two things about a client — its
 * stage and its language — so a rep who took down a wrong digit had to find a
 * laptop. Everything the create form asks is editable here, plus the notes and
 * the company block the create form never had.
 *
 * ⚠️ GATED ON `crmCaps.editInfo`, and the caller hides the way in rather than
 * disabling it. The server refuses the PATCH regardless — that is the actual
 * boundary — but a pencil that opens a form whose Save always 403s teaches
 * people the app is broken rather than that they lack an ability.
 */
export interface ClientEditForm {
  name: string;
  kind: ClientKind;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  /** '' = same as the organization; SENT as null. See clientLocalePayload. */
  locale: string;
  /** null = no workspace. An orphan client is filed by choosing one here. */
  spaceId: string | null;
  company: Record<CompanyOnlyField, string>;
}

/** The record as the form holds it — strings throughout, never null. */
export function formFromCustomer(c: MobileCustomer): ClientEditForm {
  return {
    name: c.name ?? '',
    kind: clientKind(c),
    contactName: c.contactName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    notes: c.notes ?? '',
    locale: clientLocaleFormValue(c),
    spaceId: c.spaceId ?? null,
    company: Object.fromEntries(
      COMPANY_ONLY_FIELDS.map((f) => [f, (c[f] as string | null | undefined) ?? '']),
    ) as Record<CompanyOnlyField, string>,
  };
}

/**
 * The form as the PATCH body.
 *
 * ⚠️ `clearCompanyFields` decides the company block, not an `if`. Switching a
 * client from company to person must BLANK its VAT number, not omit it: an
 * omitted key leaves the old value on a record that is no longer a company,
 * invisible, waiting to reappear the day somebody switches it back. The rule
 * lives in shared precisely so both clients cannot disagree about it.
 */
export function payloadFromForm(form: ClientEditForm): Partial<MobileCustomer> {
  const body = {
    name: form.name.trim(),
    type: form.kind,
    contactName: form.contactName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    notes: form.notes.trim(),
    locale: clientLocalePayload(form.locale),
    spaceId: form.spaceId,
    ...form.company,
  };
  return clearCompanyFields(body, form.kind) as Partial<MobileCustomer>;
}

export function ClientEditSheet({
  visible,
  customer,
  onClose,
  onSaved,
}: {
  visible: boolean;
  customer: MobileCustomer;
  onClose: () => void;
  /**
   * WHAT CHANGED, and whether it is still waiting to be sent.
   *
   * ⚠️ Not "the saved record": with the change possibly sitting in the outbox
   * there is no saved record to hand back, and the screen is already showing it
   * from there. The fields are what the server will hold once it lands, which
   * is all the caller needs to keep its own copy in step.
   */
  onSaved: (patch: Partial<MobileCustomer>, queued: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const write = useQueuedWrite();
  const [form, setForm] = useState<ClientEditForm>(() => formFromCustomer(customer));
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Re-seed from the record every time the sheet opens.

    A sheet that kept the state of the last edit would show yesterday's typing
    after a stage change refreshed the record underneath it — and worse, would
    save it.
  */
  useEffect(() => {
    if (visible) { setForm(formFromCustomer(customer)); setError(null); }
    // The record's identity is what matters; re-seeding on every field change
    // of a live record would fight the person typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customer.id]);

  /*
    The workspaces that run CRM — fetched when the sheet OPENS, not when the
    record does. A record is opened constantly and edited rarely, and this is a
    whole extra request for a picker most visits never see.
  */
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    locationsApi.list()
      .then((rows) => {
        if (!alive) return;
        setSpaces(rows.filter((r) => (r.enabledModules ?? []).includes('crm')).map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => { /* the picker simply does not appear */ });
    return () => { alive = false; };
  }, [visible]);

  const isCompanyForm = form.kind === 'COMPANY';
  const set = <K extends keyof ClientEditForm>(key: K, value: ClientEditForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim() || saving) return;
    const patch = changedFields(customer, payloadFromForm(form));
    // Nothing to say to the server. Closing IS the answer — a request that
    // restates the record unchanged would still overwrite whatever the office
    // did to it meanwhile.
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    setError(null);
    try {
      const outcome = await write.run(
        (e) => updateClientFromPhone(e, { customerId: customer.id, patch: patch as Record<string, unknown> }),
        () => customersApi.update(customer.id, patch),
      );
      if (outcome.kind === 'refused') {
        setError(outcome.message || t('customers.form.saveFailed'));
        return;
      }
      onSaved(patch, outcome.kind === 'queued');
      onClose();
    } catch (e: unknown) {
      // Shown IN the sheet, not as a toast behind it: the typing is still here
      // and a toast over a dismissed sheet loses both the reason and the work.
      setError((e as { message?: string })?.message || t('customers.form.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BlurSheet visible={visible} onClose={saving ? () => {} : onClose}>
      <SheetPanel title={t('customers.form.title')} onClose={onClose} closeDisabled={saving}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/*
            The Company/Person toggle comes FIRST because it decides what the
            rest of the form asks for. Below it, and the company block would
            appear and vanish under the reader's thumb.
          */}
          <FieldGroupTitle>{t('customers.form.kind')}</FieldGroupTitle>
          <View style={s.chips}>
            <ChoiceChip
              label={t('customers.record.kindCompany')}
              selected={isCompanyForm}
              onPress={() => set('kind', 'COMPANY')}
            />
            <ChoiceChip
              label={t('customers.record.kindPerson')}
              selected={!isCompanyForm}
              onPress={() => set('kind', 'PERSON')}
            />
          </View>

          <LabelledField label={t('customers.fName')} value={form.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" />
          <LabelledField label={t('customers.fContact')} value={form.contactName} onChangeText={(v) => set('contactName', v)} autoCapitalize="words" />
          <LabelledField label={t('customers.fEmail')} value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
          <LabelledField label={t('customers.fPhone')} value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />

          {isCompanyForm && (
            <>
              <FieldGroupTitle>{t('customers.record.details')}</FieldGroupTitle>
              {COMPANY_ONLY_FIELDS.map((field) => (
                <LabelledField
                  key={field}
                  /*
                    The shared key first, with this screen's own as the fallback.
                    COMPANY_ONLY_FIELDS is what must be shared — a field added
                    there has to appear on the form AND the record, which is the
                    drift the list exists to stop. The words themselves are not
                    in the catalogue under the shared key yet, so the fallback is
                    what actually renders today and the shared key takes over the
                    day the web's labels land.
                  */
                  label={t(COMPANY_FIELD_KEYS[field], { defaultValue: t(`customers.form.${field}`) })}
                  value={form.company[field]}
                  onChangeText={(v) => set('company', { ...form.company, [field]: v })}
                  autoCapitalize={field === 'website' ? 'none' : 'sentences'}
                  keyboardType={field === 'website' ? 'url' : undefined}
                />
              ))}
            </>
          )}

          <FieldGroupTitle>{t('customers.fWorkspace')}</FieldGroupTitle>
          {/*
            ⚠️ "No workspace" is offered, and it is not a no-op: a client filed
            in no workspace is invisible in every workspace tab. It is shown so
            an orphan can be SEEN as an orphan and filed — hiding the state is
            how a client stays lost.
          */}
          <View style={s.chips}>
            <ChoiceChip label={t('customers.noSpace')} selected={form.spaceId === null} onPress={() => set('spaceId', null)} />
            {spaces.map((sp) => (
              <ChoiceChip key={sp.id} label={sp.name} selected={form.spaceId === sp.id} onPress={() => set('spaceId', sp.id)} />
            ))}
          </View>

          <FieldGroupTitle>{t('customers.locale')}</FieldGroupTitle>
          <View style={s.chips}>
            {[{ value: '', label: t('customers.localeSame') }, ...CLIENT_LOCALE_OPTIONS].map((o) => (
              <ChoiceChip key={o.value || 'same'} label={o.label} selected={form.locale === o.value} onPress={() => set('locale', o.value)} />
            ))}
          </View>
          <Text style={s.hint}>{t('customers.localeHint')}</Text>

          <LabelledField label={t('customers.form.notes')} value={form.notes} onChangeText={(v) => set('notes', v)} multiline />

          {!!error && <Text style={s.error}>{error}</Text>}

          <PrimaryButton
            label={saving ? t('customers.form.saving') : t('customers.form.save')}
            onPress={save}
            disabled={!form.name.trim()}
            busy={saving}
          />
          <View style={{ height: SPACING.lg }} />
        </ScrollView>
      </SheetPanel>
    </BlurSheet>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    hint: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: SPACING.sm, lineHeight: 17 },
    error: { fontSize: FONT_SIZE.base, color: COLORS.error, marginTop: SPACING.md },
  });
