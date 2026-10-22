'use client';

import { kindHolderLabel, formatMoney } from '@hbcfield/shared/client';
import { type RegisterLogEntry } from '../../lib/api';
import { Pill } from '../../components/amazen';
import { holderName, statusLabel } from './register-words';
import type { useRegisterRecord } from './use-register-record';

/** What RegisterRecord works out after its early returns, moved here unchanged; called from the same place. */
export function RegisterRecordView({
  t,
  lang,
  asset,
  shape,
}: {
  t: ReturnType<typeof useRegisterRecord>['t'];
  lang: ReturnType<typeof useRegisterRecord>['lang'];
  asset: NonNullable<ReturnType<typeof useRegisterRecord>['asset']>;
  shape: ReturnType<typeof useRegisterRecord>['shape'];
}) {
  const who = holderName(asset.holders);
  const facts: [string, string][] = [
    [t('register.facts.status', 'Status'), statusLabel(t, asset.status)],
    ...(shape.holder.enabled
      ? ([[kindHolderLabel(shape, t('register.facts.holder', 'Who has it')), who ?? t('register.notHanded', 'Not handed out')]] as [
          string,
          string,
        ][])
      : []),
    ...(asset.serialNumber ? [[t('register.facts.serial', 'Serial'), asset.serialNumber]] as [string, string][] : []),
    ...([asset.manufacturer, asset.model].filter(Boolean).length
      ? ([[t('register.facts.makeModel', 'Make · model'), [asset.manufacturer, asset.model].filter(Boolean).join(' · ')]] as [
          string,
          string,
        ][])
      : []),
    ...(asset.locationAddress ? [[t('register.facts.where', 'Where'), asset.locationAddress]] as [string, string][] : []),
  ];

  const entryValue = (e: RegisterLogEntry) => (e.amountCents ? formatMoney(e.amountCents, 'EUR', lang) : null);
  const entryState = (e: RegisterLogEntry) =>
    e.status === 'SUBMITTED' ? <Pill label={t('equipment.state.office', 'Waiting for the office')} tone="warn" />
      : e.status === 'REJECTED' ? <Pill label={t('equipment.state.refused', 'Refused')} tone="critical" />
        : null;

  return { who, facts, entryValue, entryState };
}
