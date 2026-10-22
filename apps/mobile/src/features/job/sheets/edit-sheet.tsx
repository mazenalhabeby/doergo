import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateTaskInput } from '../../../lib/api';
import { knownOffline } from '../../../offline/connectivity';
import { AText, PrimaryButton, ChoiceRow, JobField, SectionLabel } from '../../../components/amazen';
import { JobSheet } from '../job-ui';

type Priority = NonNullable<UpdateTaskInput['priority']>;
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/**
 * Edit details — title, details, how urgent, address. `PUT /tasks/:id`
 * (the gateway has no PATCH there). Not queued: it needs a signal, and says so.
 */
export function EditSheet({
  visible,
  onClose,
  initial,
  busy,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  initial: { title: string; description?: string | null; priority: Priority; locationAddress?: string | null };
  busy: boolean;
  onSave: (input: UpdateTaskInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(initial.title);
    setDetails(initial.description ?? '');
    setPriority(initial.priority);
    setAddress(initial.locationAddress ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const offline = visible && knownOffline();
  const save = async () => {
    const ok = await onSave({
      title: title.trim(),
      description: details.trim() || undefined,
      priority,
      locationAddress: address.trim() || undefined,
    });
    if (ok) onClose();
  };

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.edit.title')} busy={busy}>
      <JobField value={title} onChangeText={setTitle} placeholder={t('job.edit.titlePlaceholder')} maxLength={200} />
      <JobField value={details} onChangeText={setDetails} placeholder={t('job.edit.detailsPlaceholder')} multiline maxLength={1000} />
      <SectionLabel>{t('job.edit.urgency')}</SectionLabel>
      <ChoiceRow options={PRIORITIES.map((p) => ({ key: p, label: t(`priority.${p}`) }))} value={priority} onChange={setPriority} />
      <SectionLabel>{t('job.edit.address')}</SectionLabel>
      <JobField value={address} onChangeText={setAddress} placeholder={t('taskDetail.editTask.locationPlaceholder')} maxLength={300} />
      <PrimaryButton label={t('common.save')} onPress={() => void save()} disabled={!title.trim() || offline} loading={busy} />
      {offline ? <AText variant="caption" tone="warn" style={{ textAlign: 'center' }}>{t('job.needsSignal')}</AText> : null}
    </JobSheet>
  );
}
